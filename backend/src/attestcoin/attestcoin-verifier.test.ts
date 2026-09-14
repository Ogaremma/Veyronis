import { ZeroAddress, ZeroHash, id } from "ethers";
import { describe, expect, it } from "vitest";
import type {
  AttestcoinProofRequest,
  EvidencePolicy,
  VerifiedEvidenceClaim,
} from "@veyronis/shared";
import {
  AttestcoinVerifier,
  computeClaimId,
  computeEvidenceCommitment,
  computeEvidencePolicyCommitment,
} from "./attestcoin-verifier.js";
import type {
  CryptographicProofVerifier,
  EscrowContextReader,
  EvidenceClaimRegistryGateway,
  EvidencePolicyEvaluator,
  PolicyEvaluationResult,
  ProofVerificationResult,
} from "./verifier-types.js";

const buyer = "0x1000000000000000000000000000000000000001";
const seller = "0x2000000000000000000000000000000000000002";
const escrowAddress = "0x3000000000000000000000000000000000000003";
const agreementCommitment = id("agreement");
const evidenceType = id("SOURCE_PAYMENT");
const transactionHash = id("source transaction");
const policy: EvidencePolicy = {
  version: 1,
  evidenceType,
  sourceChainKey: 1,
  assetKind: "native",
  expectedSourceContract: ZeroAddress,
  expectedRecipient: seller,
  expectedAsset: ZeroAddress,
  expectedSender: buyer,
  amountRule: "exact",
  amount: "100",
  minSourceBlock: "0",
  maxSourceBlock: "0",
  calldataSelector: "0x00000000",
  requireTransferEvent: false,
};
const policyCommitment = computeEvidencePolicyCommitment(policy);
const evidenceCommitment = computeEvidenceCommitment(
  policyCommitment,
  evidenceType,
  1,
  transactionHash,
  buyer,
);
const request: AttestcoinProofRequest = {
  escrowAddress,
  sourceChainKey: 1,
  transactionHash,
  agreementCommitment,
  evidencePolicyCommitment: policyCommitment,
  evidenceCommitment,
  evidenceType,
  subject: buyer,
  policy,
};
const acceptedClaimId = computeClaimId({
  escrow: escrowAddress,
  agreementCommitment,
  evidencePolicyCommitment: policyCommitment,
  evidenceCommitment,
  evidenceType,
  sourceChainKey: 1,
  sourceTransactionHash: transactionHash,
  subject: buyer,
});

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
      chainId: "1",
      value: "100",
      data: "0x",
      receiptStatus: 1,
      logs: [],
    },
  };
  async verify(): Promise<ProofVerificationResult> {
    return this.result;
  }
}

class FakeEvaluator implements EvidencePolicyEvaluator {
  result: PolicyEvaluationResult = {
    ok: true,
    evidence: { evidenceType, subject: buyer, amount: "100" },
  };
  evaluate(): PolicyEvaluationResult {
    return this.result;
  }
}

class FakeEscrowReader implements EscrowContextReader {
  context = {
    escrowAddress,
    agreementCommitment,
    evidencePolicyCommitment: policyCommitment,
    activeEvidenceCommitment: evidenceCommitment,
    directConditionSettlement: false,
    buyer,
    seller,
    state: 3,
  };
  async readDisputeContext() {
    return this.context;
  }

  verifiedClaimId = acceptedClaimId;
  settlement = {
    state: 4,
    verifiedClaimId: acceptedClaimId,
    activeEvidenceCommitment: evidenceCommitment,
    sellerWithdrawal: 100n,
  };

  async readVerifiedClaimId() {
    return this.verifiedClaimId;
  }

  async readSettlementContext() {
    return this.settlement;
  }
}

class FakeRegistry implements EvidenceClaimRegistryGateway {
  consumed = false;
  boundEscrow = ZeroAddress;
  rejection: Error | undefined;
  submitted: VerifiedEvidenceClaim | undefined;
  conditionSubmitted: VerifiedEvidenceClaim | undefined;
  prerequisiteSubmitted: VerifiedEvidenceClaim | undefined;
  conditionSubmissionCount = 0;
  async isClaimConsumed() {
    return this.consumed;
  }
  async sourceEvidenceEscrow() {
    return this.boundEscrow;
  }
  async submitVerifiedClaim(claim: VerifiedEvidenceClaim) {
    if (this.rejection) throw this.rejection;
    this.submitted = claim;
    return {
      claimId: acceptedClaimId,
      transactionHash: id("registry transaction"),
    };
  }
  async submitVerifiedConditionClaim(claim: VerifiedEvidenceClaim) {
    if (this.rejection) throw this.rejection;
    this.conditionSubmissionCount += 1;
    this.conditionSubmitted = claim;
    return {
      claimId: acceptedClaimId,
      transactionHash: id("registry transaction"),
    };
  }
  async submitVerifiedPrerequisiteClaim(claim: VerifiedEvidenceClaim) {
    if (this.rejection) throw this.rejection;
    this.prerequisiteSubmitted = claim;
    return {
      claimId: acceptedClaimId,
      transactionHash: id("registry transaction"),
    };
  }
}

function setup() {
  const proof = new FakeProofVerifier();
  const evaluator = new FakeEvaluator();
  const escrow = new FakeEscrowReader();
  const registry = new FakeRegistry();
  return {
    proof,
    evaluator,
    escrow,
    registry,
    verifier: new AttestcoinVerifier(proof, evaluator, escrow, registry),
  };
}

async function expectFailure(
  verifier: AttestcoinVerifier,
  code: string,
  changed = request,
) {
  const result = await verifier.verifyAndSubmit(changed);
  expect(result.ok).toBe(false);
  if (!result.ok) expect(result.code).toBe(code);
}

describe("AttestcoinVerifier", () => {
  it("domain-separates every policy field in the commitment", () => {
    const variants: EvidencePolicy[] = [
      { ...policy, version: 1 },
      { ...policy, evidenceType: id("OTHER_EVIDENCE") },
      { ...policy, sourceChainKey: 2 },
      {
        ...policy,
        assetKind: "erc20",
        expectedSourceContract: seller,
        expectedAsset: seller,
        requireTransferEvent: true,
      },
      { ...policy, expectedSourceContract: seller },
      { ...policy, expectedRecipient: buyer },
      { ...policy, expectedAsset: seller },
      { ...policy, expectedSender: seller },
      { ...policy, amountRule: "minimum" },
      { ...policy, amount: "101" },
      { ...policy, minSourceBlock: "1" },
      { ...policy, maxSourceBlock: "100" },
      { ...policy, calldataSelector: "0xa9059cbb" },
      { ...policy, requireTransferEvent: true },
    ];
    const commitments = variants.map(computeEvidencePolicyCommitment);
    expect(new Set(commitments).size).toBe(commitments.length);
  });

  it("accepts policy-bound verified evidence", async () => {
    const { verifier, registry } = setup();
    const result = await verifier.verifyAndSubmit(request);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.verifiedAmount).toBe("100");
    expect(registry.submitted?.evidencePolicyCommitment).toBe(policyCommitment);
  });

  it("submits funded conditions to the settlement registry path", async () => {
    const { verifier, escrow, registry } = setup();
    escrow.context.state = 1;
    escrow.context.activeEvidenceCommitment = ZeroHash;
    escrow.context.directConditionSettlement = true;

    const result = await verifier.verifyAndSubmit({
      ...request,
      conditionSubmission: "direct_settlement",
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.verifiedFacts).toMatchObject({
        sourceChainKey: 1,
        sourceTransactionHash: transactionHash,
        sourceBlockNumber: 100,
        chainId: "1",
        sender: buyer,
        recipient: seller,
        amount: "100",
        transactionIncluded: true,
        transactionSucceeded: true,
        conditionMatch: true,
      });
    }
    expect(registry.submitted).toBeUndefined();
    expect(registry.conditionSubmitted?.evidenceCommitment).toBe(
      evidenceCommitment,
    );
  });

  it("retries an already-submitted settlement claim without duplicating it", async () => {
    const { verifier, escrow, registry } = setup();
    escrow.context.state = 1;
    escrow.context.activeEvidenceCommitment = ZeroHash;
    escrow.context.directConditionSettlement = true;
    const directRequest = {
      ...request,
      conditionSubmission: "direct_settlement",
    } as const;

    const first = await verifier.verifyAndSubmit(directRequest);
    expect(first.ok).toBe(true);
    registry.boundEscrow = escrowAddress;
    escrow.context.state = 4;

    const retry = await verifier.verifyAndSubmit(directRequest);

    expect(retry.ok).toBe(true);
    expect(registry.conditionSubmissionCount).toBe(1);
  });

  it("records hybrid conditions without settling them", async () => {
    const { verifier, escrow, registry } = setup();
    escrow.context.state = 1;
    escrow.context.activeEvidenceCommitment = ZeroHash;
    escrow.context.directConditionSettlement = false;
    escrow.settlement = {
      state: 1,
      verifiedClaimId: acceptedClaimId,
      activeEvidenceCommitment: ZeroHash,
      sellerWithdrawal: 0n,
    };

    const result = await verifier.verifyAndSubmit({
      ...request,
      conditionSubmission: "prerequisite_record",
    });

    expect(result.ok).toBe(true);
    expect(registry.conditionSubmitted).toBeUndefined();
    expect(registry.prerequisiteSubmitted?.evidenceCommitment).toBe(
      evidenceCommitment,
    );
  });

  it("rejects a condition submission that did not credit the seller", async () => {
    const { verifier, escrow, registry } = setup();
    escrow.context.state = 1;
    escrow.context.activeEvidenceCommitment = ZeroHash;
    escrow.context.directConditionSettlement = true;
    escrow.settlement.sellerWithdrawal = 0n;

    await expectFailure(verifier, "ESCROW_SETTLEMENT_FAILED", {
      ...request,
      conditionSubmission: "direct_settlement",
    });
    expect(registry.conditionSubmitted).toBeDefined();
  });

  it("rejects policy substitution and policy/escrow mismatch", async () => {
    const { verifier, escrow } = setup();
    await expectFailure(verifier, "POLICY_COMMITMENT_MISMATCH", {
      ...request,
      evidencePolicyCommitment: id("other"),
    });
    escrow.context.evidencePolicyCommitment = id("other");
    await expectFailure(verifier, "POLICY_COMMITMENT_MISMATCH");
  });

  it("rejects evaluator failures before registry submission", async () => {
    const { verifier, evaluator, registry } = setup();
    evaluator.result = { ok: false, code: "WRONG_AMOUNT", message: "amount" };
    await expectFailure(verifier, "WRONG_AMOUNT");
    expect(registry.submitted).toBeUndefined();
  });

  it.each([
    ["UNSUPPORTED_SOURCE_CHAIN", "sourceChainKey"],
    ["TRANSACTION_HASH_MISMATCH", "transactionHash"],
    ["ESCROW_MISMATCH", "escrowAddress"],
    ["AGREEMENT_COMMITMENT_MISMATCH", "agreementCommitment"],
    ["EVIDENCE_COMMITMENT_MISMATCH", "evidenceCommitment"],
  ] as const)("rejects %s", async (code, field) => {
    const { verifier, proof, escrow } = setup();
    if (field === "sourceChainKey" && proof.result.ok)
      proof.result.transaction.sourceChainKey = 2;
    else if (field === "transactionHash" && proof.result.ok)
      proof.result.transaction.sourceTransactionHash = id("other");
    else if (field === "escrowAddress") escrow.context.escrowAddress = seller;
    else if (field === "agreementCommitment")
      escrow.context.agreementCommitment = id("other");
    else escrow.context.activeEvidenceCommitment = id("other");
    await expectFailure(verifier, code);
  });

  it("rejects invalid states, replayed, and registry-rejected claims", async () => {
    const { verifier, escrow, registry } = setup();
    escrow.context.state = 0;
    await expectFailure(verifier, "ESCROW_NOT_SETTLEABLE");
    escrow.context.state = 1;
    await expectFailure(verifier, "ESCROW_NOT_SETTLEABLE");
    escrow.context.state = 3;
    registry.consumed = true;
    await expectFailure(verifier, "REPLAY_DETECTED");
    registry.consumed = false;
    registry.rejection = new Error("rejected");
    await expectFailure(verifier, "AUTHORIZED_CLAIM_FAILED");
  });

  it("never calls escrow settlement directly", async () => {
    const { verifier, escrow } = setup();
    expect("resolveDispute" in escrow).toBe(false);
    expect("withdraw" in escrow).toBe(false);
    await verifier.verifyAndSubmit(request);
  });
});
