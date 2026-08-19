import { createServer } from "node:http";
import { Wallet, ZeroAddress, id } from "ethers";
import { afterEach, describe, expect, it, vi } from "vitest";
import { WalletAuthService } from "../auth/wallet-auth.js";
import { createAgreementHttpHandler, InMemoryRateLimiter } from "./agreement-http.js";

const buyer = new Wallet(`0x${"11".repeat(32)}`);
const wrongWallet = new Wallet(`0x${"22".repeat(32)}`);
const agreementId = id("agreement");
const draft = {
  buyer: buyer.address,
  seller: "0x3000000000000000000000000000000000000003",
  arbitrator: "0x4000000000000000000000000000000000000004",
  evidenceRegistry: "0x5000000000000000000000000000000000000005",
  requiredAmount: "100",
  agreementNonce: id("nonce"),
  policy: {
    version: 1, evidenceType: id("SOURCE_PAYMENT"), sourceChainKey: 1,
    assetKind: "native", expectedSourceContract: ZeroAddress,
    expectedRecipient: "0x3000000000000000000000000000000000000003",
    expectedAsset: ZeroAddress, expectedSender: buyer.address,
    amountRule: "exact", amount: "100", minSourceBlock: "0", maxSourceBlock: "0",
    calldataSelector: "0x00000000", requireTransferEvent: false,
  },
};

const servers: ReturnType<typeof createServer>[] = [];
afterEach(async () => Promise.all(servers.splice(0).map((server) => new Promise<void>((resolve) => server.close(() => resolve())))));

async function sessionCookie(auth: WalletAuthService, wallet: Wallet): Promise<string> {
  const challenge = auth.createChallenge(wallet.address);
  return `veyronis_session=${auth.verify(wallet.address, await wallet.signMessage(challenge.message))}`;
}

async function setup(limit = 20) {
  const auth = new WalletAuthService("a sufficiently long test secret");
  const stored = { ...draft, id: agreementId, agreementCommitment: id("commitment"), evidencePolicyCommitment: id("policy"), deploymentStatus: "AWAITING_CONFIRMATION", createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
  const service = {
    prepare: vi.fn(async () => ({ agreement: stored, confirmationRequired: true })),
    getAgreement: vi.fn(async () => stored),
    confirmAndDeploy: vi.fn(async () => ({ ...stored, deploymentStatus: "DEPLOYED" })),
  };
  const limiter = () => new InMemoryRateLimiter(limit, 60_000, 2, () => 0);
  const server = createServer(createAgreementHttpHandler(service as never, { auth, appEnv: "local", creationLimiter: limiter(), confirmationLimiter: limiter() }));
  servers.push(server);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Server did not bind");
  return { auth, service, url: `http://127.0.0.1:${address.port}` };
}

describe("agreement HTTP authorization", () => {
  it("returns 401 for both mutating routes without a session", async () => {
    const { url } = await setup();
    expect((await fetch(`${url}/agreements`, { method: "POST", body: JSON.stringify(draft) })).status).toBe(401);
    expect((await fetch(`${url}/agreements/${agreementId}/confirm`, { method: "POST" })).status).toBe(401);
  });

  it("returns 403 for the wrong authenticated wallet", async () => {
    const { auth, service, url } = await setup();
    const cookie = await sessionCookie(auth, wrongWallet);
    expect((await fetch(`${url}/agreements`, { method: "POST", headers: { cookie }, body: JSON.stringify(draft) })).status).toBe(403);
    expect((await fetch(`${url}/agreements/${agreementId}/confirm`, { method: "POST", headers: { cookie } })).status).toBe(403);
    expect(service.prepare).not.toHaveBeenCalled();
    expect(service.confirmAndDeploy).not.toHaveBeenCalled();
  });

  it("allows the authenticated buyer into existing service flows", async () => {
    const { auth, service, url } = await setup();
    const cookie = await sessionCookie(auth, buyer);
    expect((await fetch(`${url}/agreements`, { method: "POST", headers: { cookie }, body: JSON.stringify(draft) })).status).toBe(201);
    expect((await fetch(`${url}/agreements/${agreementId}/confirm`, { method: "POST", headers: { cookie } })).status).toBe(200);
    expect(service.prepare).toHaveBeenCalledOnce();
    expect(service.confirmAndDeploy).toHaveBeenCalledOnce();
  });

  it("rate limits creation and confirmation only after normal requests are allowed", async () => {
    const { auth, url } = await setup(2);
    const cookie = await sessionCookie(auth, buyer);
    for (let index = 0; index < 2; index += 1) {
      expect((await fetch(`${url}/agreements`, { method: "POST", headers: { cookie }, body: JSON.stringify(draft) })).status).toBe(201);
      expect((await fetch(`${url}/agreements/${agreementId}/confirm`, { method: "POST", headers: { cookie } })).status).toBe(200);
    }
    expect((await fetch(`${url}/agreements`, { method: "POST", headers: { cookie }, body: JSON.stringify(draft) })).status).toBe(429);
    expect((await fetch(`${url}/agreements/${agreementId}/confirm`, { method: "POST", headers: { cookie } })).status).toBe(429);
  });

  it("keeps limiter state bounded and controllable", () => {
    const limiter = new InMemoryRateLimiter(1, 1000, 2, () => 0);
    limiter.allow("a"); limiter.allow("b"); limiter.allow("c");
    expect(limiter.size).toBe(2);
    limiter.clear();
    expect(limiter.size).toBe(0);
  });
});
