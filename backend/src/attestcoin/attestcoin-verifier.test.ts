import { ZeroAddress, id } from "ethers";
import { describe, expect, it } from "vitest";
import type { AttestcoinProofRequest, VerifiedEvidenceClaim } from "@veyronis/shared";
import {
  AttestcoinVerifier,
  computeClaimId,
  computeEvidenceCommitment,
} from "./attestcoin-verifier.js";
import type {
  CryptographicProofVerifier,
  EscrowContextReader,
  EvidenceClaimRegistryGateway,
  ProofVerificationResult,
  VerifiedEvidenceInterpreter,
} from "./verifier-types.js";

const buyer = "0x1000000000000000000000000000000000000001";
const seller = "0x2000000000000000000000000000000000000002";
const escrowAddress = "0x3000000000000000000000000000000000000003";
const agreementCommitment = id("agreement");
const evidenceType = id("SOURCE_PAYMENT");
const transactionHash = id("source transaction");
const evidenceCommitment = computeEvidenceCommitment(evidenceType, 1, transactionHash, buyer);

const request: AttestcoinProofRequest = {
  escrowAddress,
  sourceChainKey: 1,
  transactionHash,
  agreementCommitment,
  evidenceCommitment,
  evidenceType,
  subject: buyer,
};

class FakeProofVerifier implements CryptographicProofVerifier {
  result: ProofVerificationResult = {
    ok: true,
    transaction: {
      sourceChainKey: 1,
      sourceTransactionHash: transactionHash,
      sourceBlockNumber: 100,
      transactionIndex: 2,
      from: buyer,
      to: seller,
    },
  };
  async verify(): Promise<ProofVerificationResult> {
    return this.result;
  }
}

class FakeInterpreter implements VerifiedEvidenceInterpreter {
  evidenceType = evidenceType;
  subject = buyer;
  interpret() {
    return { evidenceType: this.evidenceType, subject: this.subject };
  }
}

class FakeEscrowReader implements EscrowContextReader {
  context = {
    escrowAddress,
    agreementCommitment,
    activeEvidenceCommitment: evidenceCommitment,
    buyer,
    seller,
    state: 3,
  };
  async readDisputeContext() {
    return this.context;
  }
}

class FakeRegistry implements EvidenceClaimRegistryGateway {
  consumed = false;
  boundEscrow = ZeroAddress;
  rejection: Error | undefined;
  submitted: VerifiedEvidenceClaim | undefined;
  async isClaimConsumed() {
    return this.consumed;
  }
  async sourceEvidenceEscrow() {
    return this.boundEscrow;
  }
  async submitVerifiedClaim(claim: VerifiedEvidenceClaim) {
    if (this.rejection) throw this.rejection;
    this.submitted = claim;
    return { claimId: computeClaimId(claim), transactionHash: id("registry transaction") };
  }
}

function setup() {
  const proof = new FakeProofVerifier();
  const interpreter = new FakeInterpreter();
  const escrow = new FakeEscrowReader();
  const registry = new FakeRegistry();
  const verifier = new AttestcoinVerifier(proof, interpreter, escrow, registry);
  return { proof, interpreter, escrow, registry, verifier };
}

async function expectFailure(
  verifier: AttestcoinVerifier,
  expectedCode: string,
  changedRequest: AttestcoinProofRequest = request,
) {
  const result = await verifier.verifyAndSubmit(changedRequest);
  expect(result.ok).toBe(false);
  if (!result.ok) expect(result.code).toBe(expectedCode);
}

describe("AttestcoinVerifier", () => {
  it("accepts a cryptographically verified and semantically matching proof", async () => {
    const { verifier, registry } = setup();
    const result = await verifier.verifyAndSubmit(request);
    expect(result.ok).toBe(true);
    expect(registry.submitted).toEqual({
      escrow: escrowAddress,
      agreementCommitment,
      evidenceCommitment,
      evidenceType,
      sourceChainKey: 1,
      sourceTransactionHash: transactionHash,
      subject: buyer,
    });
  });

  it.each([
    ["INVALID_PROOF", "INVALID_PROOF"],
    ["PROOF_VERIFICATION_FAILURE", "PROOF_VERIFICATION_FAILURE"],
    ["PROVIDER_FAILURE", "PROVIDER_FAILURE"],
  ] as const)("propagates %s without registry submission", async (proofCode, expectedCode) => {
    const { verifier, proof, registry } = setup();
    proof.result = { ok: false, code: proofCode, message: "proof failed" };
    await expectFailure(verifier, expectedCode);
    expect(registry.submitted).toBeUndefined();
  });

  it("rejects the wrong verified source chain", async () => {
    const { verifier, proof } = setup();
    if (proof.result.ok) proof.result.transaction.sourceChainKey = 2;
    await expectFailure(verifier, "UNSUPPORTED_SOURCE_CHAIN");
  });

  it("rejects the wrong verified transaction hash", async () => {
    const { verifier, proof } = setup();
    if (proof.result.ok) proof.result.transaction.sourceTransactionHash = id("other transaction");
    await expectFailure(verifier, "TRANSACTION_HASH_MISMATCH");
  });

  it("rejects the wrong proof-derived subject", async () => {
    const { verifier, interpreter } = setup();
    interpreter.subject = seller;
    await expectFailure(verifier, "SUBJECT_MISMATCH");
  });

  it("rejects the wrong interpreted evidence type", async () => {
    const { verifier, interpreter } = setup();
    interpreter.evidenceType = id("OTHER_TYPE");
    await expectFailure(verifier, "EVIDENCE_TYPE_MISMATCH");
  });

  it("rejects a context loaded for another escrow", async () => {
    const { verifier, escrow } = setup();
    escrow.context.escrowAddress = seller;
    await expectFailure(verifier, "ESCROW_MISMATCH");
  });

  it("rejects the wrong agreement commitment", async () => {
    const { verifier, escrow } = setup();
    escrow.context.agreementCommitment = id("other agreement");
    await expectFailure(verifier, "AGREEMENT_COMMITMENT_MISMATCH");
  });

  it("rejects a dispute commitment different from the request", async () => {
    const { verifier, escrow } = setup();
    escrow.context.activeEvidenceCommitment = id("other commitment");
    await expectFailure(verifier, "EVIDENCE_COMMITMENT_MISMATCH");
  });

  it("rejects normalized evidence that does not reproduce the commitment", async () => {
    const { verifier, escrow } = setup();
    const wrong = id("wrong normalized commitment");
    escrow.context.activeEvidenceCommitment = wrong;
    await expectFailure(verifier, "EVIDENCE_COMMITMENT_MISMATCH", {
      ...request,
      evidenceCommitment: wrong,
    });
  });

  it("rejects a non-disputed escrow", async () => {
    const { verifier, escrow } = setup();
    escrow.context.state = 1;
    await expectFailure(verifier, "ESCROW_NOT_DISPUTABLE");
  });

  it.each(["consumed", "bound"] as const)("rejects %s replay state", async (kind) => {
    const { verifier, registry } = setup();
    if (kind === "consumed") registry.consumed = true;
    else registry.boundEscrow = escrowAddress;
    await expectFailure(verifier, "REPLAY_DETECTED");
  });

  it("propagates registry rejection as a structured failure", async () => {
    const { verifier, registry } = setup();
    registry.rejection = new Error("execution reverted");
    await expectFailure(verifier, "REGISTRY_REJECTION");
  });

  it("exposes no escrow settlement dependency or call", async () => {
    const { verifier, escrow } = setup();
    expect("resolveDispute" in escrow).toBe(false);
    expect("withdraw" in escrow).toBe(false);
    expect((await verifier.verifyAndSubmit(request)).ok).toBe(true);
  });

  it("uses the exact Phase 3 ABI commitment model", () => {
    expect(computeEvidenceCommitment(evidenceType, 1, transactionHash, buyer)).toBe(
      evidenceCommitment,
    );
  });
});
