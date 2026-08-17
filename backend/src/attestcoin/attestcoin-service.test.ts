import type { proofProvider } from "@gluwa/usc-sdk";
import { AbiCoder, Transaction, Wallet, ZeroAddress, id } from "ethers";
import { describe, expect, it } from "vitest";
import type { AttestcoinProofRequest, EvidencePolicy } from "@veyronis/shared";
import type { AppConfig } from "../config.js";
import { AttestcoinService } from "./attestcoin-service.js";
import { computeEvidenceCommitment, computeEvidencePolicyCommitment } from "./attestcoin-verifier.js";

const key = "0x1111111111111111111111111111111111111111111111111111111111111111";
const config: AppConfig = {
  CREDITCOIN_RPC_URL: "http://127.0.0.1:8545",
  ATTESTCOIN_PROOF_BUILDER_URL: "http://127.0.0.1:8080",
  SEPOLIA_CHAIN_KEY: 1,
  VEYRONIS_EVIDENCE_REGISTRY_ADDRESS: "0x3000000000000000000000000000000000000003",
  VEYRONIS_VERIFIER_PRIVATE_KEY: key,
};
const coder = AbiCoder.defaultAbiCoder();

async function setup() {
  const wallet = new Wallet(key);
  const recipient = "0x2000000000000000000000000000000000000002";
  const raw = await wallet.signTransaction({ chainId: 11155111, nonce: 0, gasLimit: 21_000, maxFeePerGas: 1, maxPriorityFeePerGas: 1, to: recipient, value: 1 });
  const tx = Transaction.from(raw);
  const common = coder.encode(["uint64", "uint64", "address", "bool", "address", "uint256", "bytes"], [tx.nonce, tx.gasLimit, tx.from, false, recipient, tx.value, tx.data]);
  const fields = coder.encode(["uint64", "uint128", "uint128", "tuple(address,bytes32[])[]", "uint8", "bytes32", "bytes32"], [tx.chainId, tx.maxPriorityFeePerGas, tx.maxFeePerGas, [], tx.signature!.yParity, tx.signature!.r, tx.signature!.s]);
  const receipt = coder.encode(["uint8", "uint64", "tuple(address,bytes32[],bytes)[]", "bytes"], [1, 21_000, [], "0x"]);
  const encoded = coder.encode(["uint8", "bytes[]"], [2, [common, fields, receipt]]);
  const proofData: proofProvider.ContinuityResponse = {
    chainKey: 1, headerNumber: 50, txIndex: 0, txHash: tx.hash!, txBytes: encoded,
    continuityProof: { lowerEndpointDigest: "0x" + "11".repeat(32), roots: [] },
    merkleProof: { root: "0x" + "22".repeat(32), siblings: [] }, cached: false, generatedAt: new Date(),
  };
  const service = new AttestcoinService(config);
  service.chainInfo.getSupportedChainByKey = async () => ({ chainKey: 1, chainId: 11155111, chainName: "0x", chainEncoding: 1 });
  service.proofBuilder.getProof = async () => ({ success: true, data: proofData });
  service.blockProver.computeTransactionIndex = async () => 0;
  service.blockProver.verifySingle = async () => true;
  const policy: EvidencePolicy = {
    version: 1, evidenceType: id("SOURCE_PAYMENT"), sourceChainKey: 1, assetKind: "native",
    expectedSourceContract: ZeroAddress, expectedRecipient: recipient, expectedAsset: ZeroAddress,
    expectedSender: wallet.address, amountRule: "exact", amount: "1", minSourceBlock: "0", maxSourceBlock: "0",
    calldataSelector: "0x00000000", requireTransferEvent: false,
  };
  const policyCommitment = computeEvidencePolicyCommitment(policy);
  const request: AttestcoinProofRequest = {
    escrowAddress: config.VEYRONIS_EVIDENCE_REGISTRY_ADDRESS, sourceChainKey: 1, transactionHash: tx.hash!,
    agreementCommitment: id("agreement"), evidencePolicyCommitment: policyCommitment,
    evidenceCommitment: computeEvidenceCommitment(policyCommitment, policy.evidenceType, 1, tx.hash!, wallet.address),
    evidenceType: policy.evidenceType, subject: wallet.address, policy,
  };
  return { service, request, proofData };
}

describe("AttestcoinService", () => {
  it("distinguishes generated proofs from precompile verification", async () => {
    const { service, request } = await setup();
    service.blockProver.verifySingle = async () => false;
    expect(await service.verify(request)).toMatchObject({ ok: false, code: "PROOF_VERIFICATION_FAILURE" });
  });

  it("decodes the SDK transaction-plus-receipt leaf after verification", async () => {
    const { service, request } = await setup();
    const result = await service.verify(request);
    expect(result).toMatchObject({ ok: true, transaction: { sourceBlockNumber: 50, transactionIndex: 0, value: "1", receiptStatus: 1 } });
    if (result.ok) expect(result.transaction.sourceTransactionHash).toBe(request.transactionHash);
  });

  it("rejects substituted metadata and malformed encoded contexts", async () => {
    const { service, request, proofData } = await setup();
    proofData.txHash = id("other");
    expect(await service.verify(request)).toMatchObject({ ok: false, code: "TRANSACTION_HASH_MISMATCH" });
    proofData.txHash = request.transactionHash;
    proofData.txBytes = "0x1234";
    expect(await service.verify(request)).toMatchObject({ ok: false, code: "MISSING_TRANSACTION_CONTEXT" });
  });

  it("rejects a Merkle-derived transaction index mismatch and provider failures", async () => {
    const { service, request } = await setup();
    service.blockProver.computeTransactionIndex = async () => 1;
    expect(await service.verify(request)).toMatchObject({ ok: false, code: "INVALID_PROOF" });
    service.blockProver.computeTransactionIndex = async () => 0;
    service.proofBuilder.getProof = async () => { throw new Error("secret"); };
    expect(await service.verify(request)).toMatchObject({ ok: false, code: "PROVIDER_FAILURE" });
  });
});
