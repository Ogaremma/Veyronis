import type { proofProvider } from "@gluwa/usc-sdk";
import { Wallet } from "ethers";
import { describe, expect, it } from "vitest";
import type { AttestcoinProofRequest } from "@veyronis/shared";
import type { AppConfig } from "../config.js";
import { AttestcoinService } from "./attestcoin-service.js";

const config: AppConfig = {
  CREDITCOIN_RPC_URL: "http://127.0.0.1:8545",
  ATTESTCOIN_PROOF_BUILDER_URL: "http://127.0.0.1:8080",
  SEPOLIA_CHAIN_KEY: 1,
  VEYRONIS_EVIDENCE_REGISTRY_ADDRESS: "0x3000000000000000000000000000000000000003",
  VEYRONIS_VERIFIER_PRIVATE_KEY:
    "0x1111111111111111111111111111111111111111111111111111111111111111",
};

async function setup() {
  const rawTransaction = await new Wallet(config.VEYRONIS_VERIFIER_PRIVATE_KEY).signTransaction({
    chainId: 11155111,
    nonce: 0,
    gasLimit: 21_000,
    gasPrice: 1,
    to: "0x2000000000000000000000000000000000000002",
    value: 1,
  });
  const hash = (await import("ethers")).Transaction.from(rawTransaction).hash!;
  const proofData: proofProvider.ContinuityResponse = {
    chainKey: 1,
    headerNumber: 50,
    txIndex: 0,
    txHash: hash,
    txBytes: rawTransaction,
    continuityProof: { lowerEndpointDigest: "0x" + "11".repeat(32), roots: [] },
    merkleProof: { root: "0x" + "22".repeat(32), siblings: [] },
    cached: false,
    generatedAt: new Date(),
  };
  const service = new AttestcoinService(config);
  service.chainInfo.getSupportedChainByKey = async () => ({
    chainKey: 1,
    chainId: 11155111,
    chainName: "0x",
    chainEncoding: 1,
  });
  service.proofBuilder.getProof = async () => ({ success: true, data: proofData });
  service.blockProver.computeTransactionIndex = async () => 0;
  service.blockProver.verifySingle = async () => true;
  const request: AttestcoinProofRequest = {
    escrowAddress: config.VEYRONIS_EVIDENCE_REGISTRY_ADDRESS,
    sourceChainKey: 1,
    transactionHash: hash,
    agreementCommitment: "0x" + "33".repeat(32),
    evidenceCommitment: "0x" + "44".repeat(32),
    evidenceType: "0x" + "55".repeat(32),
    subject: new Wallet(config.VEYRONIS_VERIFIER_PRIVATE_KEY).address,
  };
  return { service, request, proofData };
}

describe("AttestcoinService", () => {
  it("distinguishes proof generation from Creditcoin precompile verification", async () => {
    const { service, request } = await setup();
    service.blockProver.verifySingle = async () => false;
    const result = await service.verify(request);
    expect(result).toMatchObject({ ok: false, code: "PROOF_VERIFICATION_FAILURE" });
  });

  it("returns normalized context only after proof and metadata checks pass", async () => {
    const { service, request } = await setup();
    const result = await service.verify(request);
    expect(result).toMatchObject({
      ok: true,
      transaction: {
        sourceChainKey: 1,
        sourceTransactionHash: request.transactionHash,
        sourceBlockNumber: 50,
        transactionIndex: 0,
      },
    });
    if (result.ok) expect(result.transaction.from).toBe(request.subject);
  });

  it("rejects substituted proof metadata before precompile verification", async () => {
    const { service, request, proofData } = await setup();
    proofData.txHash = "0x" + "99".repeat(32);
    const result = await service.verify(request);
    expect(result).toMatchObject({ ok: false, code: "TRANSACTION_HASH_MISMATCH" });
  });

  it("rejects a Merkle-derived transaction index mismatch", async () => {
    const { service, request } = await setup();
    service.blockProver.computeTransactionIndex = async () => 1;
    const result = await service.verify(request);
    expect(result).toMatchObject({ ok: false, code: "INVALID_PROOF" });
  });

  it("handles proof provider failures without leaking provider details", async () => {
    const { service, request } = await setup();
    service.proofBuilder.getProof = async () => {
      throw new Error("secret endpoint response");
    };
    const result = await service.verify(request);
    expect(result).toMatchObject({ ok: false, code: "PROVIDER_FAILURE" });
    if (!result.ok) expect(result.message).not.toContain("secret endpoint response");
  });
});
