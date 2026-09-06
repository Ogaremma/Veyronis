import { createServer } from "node:http";
import { Wallet, ZeroAddress, id } from "ethers";
import { afterEach, describe, expect, it, vi } from "vitest";
import { WalletAuthService } from "../auth/wallet-auth.js";
import { createAgreementHttpHandler } from "./agreement-http.js";

const buyer = new Wallet(`0x${"11".repeat(32)}`);
const seller = new Wallet(`0x${"22".repeat(32)}`);
const arbitrator = new Wallet(`0x${"33".repeat(32)}`);
const outsider = new Wallet(`0x${"44".repeat(32)}`);
const escrow = "0x5000000000000000000000000000000000000005";
const txHash = `0x${"ab".repeat(32)}`;
const policy = {
  version: 1, evidenceType: id("SOURCE_PAYMENT"), sourceChainKey: 1,
  assetKind: "native" as const, expectedSourceContract: ZeroAddress,
  expectedRecipient: seller.address, expectedAsset: ZeroAddress,
  expectedSender: buyer.address, amountRule: "exact" as const, amount: "100",
  minSourceBlock: "0", maxSourceBlock: "0", calldataSelector: "0x00000000",
  requireTransferEvent: false,
};
const agreement = {
  id: id("agreement"), buyer: buyer.address, seller: seller.address,
  arbitrator: arbitrator.address, requiredAmount: "100", agreementNonce: id("nonce"),
  agreementCommitment: id("agreement-commitment"), evidencePolicyCommitment: id("policy-commitment"),
  evidenceRegistry: "0x6000000000000000000000000000000000000006", escrowAddress: escrow,
  policy, deploymentStatus: "DEPLOYED" as const, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
};
const servers: ReturnType<typeof createServer>[] = [];
afterEach(async () => Promise.all(servers.splice(0).map((s) => new Promise<void>((r) => s.close(() => r())))));

async function setup(verifierResult: any = { ok: false, code: "ESCROW_NOT_DISPUTABLE", message: "The escrow is not in the disputed state" }) {
  const auth = new WalletAuthService("a sufficiently long test secret");
  const service = { getAgreementByEscrowAddress: vi.fn(async () => agreement) };
  const verifier = { verifyAndSubmit: vi.fn(async () => verifierResult) };
  const server = createServer(createAgreementHttpHandler(service as never, { auth, appEnv: "local", attestcoinVerifier: verifier }));
  servers.push(server);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("bind failed");
  const cookie = async (wallet: Wallet) => {
    const challenge = auth.createChallenge(wallet.address);
    return `veyronis_session=${auth.verify(wallet.address, await wallet.signMessage(challenge.message))}`;
  };
  return { url: `http://127.0.0.1:${address.port}`, service, verifier, cookie };
}

async function post(url: string, body: unknown, cookie?: string) {
  return fetch(`${url}/evidence/verify`, { method: "POST", headers: { "content-type": "application/json", ...(cookie ? { cookie } : {}) }, body: JSON.stringify(body) });
}

describe("POST /evidence/verify", () => {
  it("requires authentication and validates inputs", async () => {
    const { url, cookie } = await setup();
    expect((await post(url, { escrowAddress: escrow, transactionHash: txHash })).status).toBe(401);
    const outsiderResponse = await post(url, { escrowAddress: escrow, transactionHash: txHash }, await cookie(outsider));
    expect(outsiderResponse.status).toBe(403);
    expect((await post(url, { escrowAddress: "bad", transactionHash: txHash }, await cookie(buyer))).status).toBe(400);
    expect((await post(url, { escrowAddress: escrow, transactionHash: "0x1234" }, await cookie(buyer))).status).toBe(400);
  });

  it("returns 404 for an unknown escrow", async () => {
    const { url, cookie, service } = await setup();
    service.getAgreementByEscrowAddress.mockResolvedValueOnce(undefined as any);
    expect((await post(url, { escrowAddress: escrow, transactionHash: txHash }, await cookie(buyer))).status).toBe(404);
  });

  it("propagates verifier and escrow-state failures without mutation", async () => {
    const { url, cookie, verifier } = await setup({ ok: false, code: "PROOF_INVALID", message: "proof rejected" });
    const response = await post(url, { escrowAddress: escrow, transactionHash: txHash }, await cookie(buyer));
    expect(response.status).toBe(422);
    expect(await response.json()).toMatchObject({ ok: false, code: "PROOF_INVALID" });
    expect(verifier.verifyAndSubmit).toHaveBeenCalledOnce();
  });

  it("returns claim metadata on success and does not expose proof material", async () => {
    const result = { ok: true, claimId: id("claim"), transactionHash: txHash, claim: { sourceChainKey: 1, sourceTransactionHash: txHash, subject: buyer.address, evidenceType: policy.evidenceType } };
    const { url, cookie, verifier } = await setup(result);
    const response = await post(url, { escrowAddress: escrow, transactionHash: txHash }, await cookie(buyer));
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toMatchObject({ ok: true, claimId: result.claimId, registryTransactionHash: txHash, evidence: result.claim });
    expect(JSON.stringify(body)).not.toMatch(/private|proof|continuity|merkle|signer|rpc/i);
    expect(verifier.verifyAndSubmit).toHaveBeenCalledWith(expect.objectContaining({ escrowAddress: escrow, transactionHash: txHash }));
    expect(verifier).not.toHaveProperty("verifyAndEmit");
  });
});
