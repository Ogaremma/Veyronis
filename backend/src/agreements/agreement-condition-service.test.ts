import { Interface, ZeroAddress, id, zeroPadValue } from "ethers";
import { describe, expect, it, vi } from "vitest";
import type {
  AgreementMetadata,
  AttestcoinProofRequest,
  EvidencePolicy,
} from "@veyronis/shared";
import {
  computeAgreementCommitment,
  computeEvidencePolicyCommitment,
  type VerifiedEvidenceClaim,
} from "@veyronis/shared";
import { computeClaimId } from "../attestcoin/attestcoin-verifier.js";
import { SourceTransactionPolicyEvaluator } from "../attestcoin/source-transaction-interpreter.js";
import type {
  CryptographicProofVerifier,
  EvidenceClaimRegistryGateway,
  ProofVerificationResult,
  VerifiedSourceTransaction,
} from "../attestcoin/verifier-types.js";
import { InMemoryAgreementRepository } from "./agreement-repository.js";
import {
  AgreementConditionService,
  AgreementConditionServiceError,
} from "./agreement-condition-service.js";
import { InMemoryAgreementConditionVerificationRepository } from "./agreement-condition-repository.js";

const buyer = "0x1000000000000000000000000000000000000001";
const seller = "0x2000000000000000000000000000000000000002";
const arbitrator = "0x3000000000000000000000000000000000000003";
const token = "0x4000000000000000000000000000000000000004";
const escrow = "0x5000000000000000000000000000000000000005";
const unrelated = "0x9000000000000000000000000000000000000009";
const agreementId = id("condition agreement");
const transferTopic = id("Transfer(address,address,uint256)");
const transferInterface = new Interface(["function transfer(address,uint256)"]);

const policy: EvidencePolicy = {
  version: 1,
  evidenceType: id("SOURCE_PAYMENT"),
  sourceChainKey: 1,
  assetKind: "erc20",
  expectedSourceContract: token,
  expectedRecipient: buyer,
  expectedAsset: token,
  expectedSender: seller,
  amountRule: "exact",
  amount: "100000000",
  minSourceBlock: "0",
  maxSourceBlock: "0",
  calldataSelector: "0xa9059cbb",
  requireTransferEvent: true,
};

const agreement: AgreementMetadata = {
  id: agreementId,
  buyer,
  seller,
  arbitrator,
  evidenceRegistry: "0x6000000000000000000000000000000000000006",
  requiredAmount: "100000000000000",
  agreementNonce: id("nonce"),
  agreementCommitment: computeAgreementCommitment({
    buyer,
    seller,
    arbitrator,
    evidenceRegistry: "0x6000000000000000000000000000000000000006",
    requiredAmount: "100000000000000",
    agreementNonce: id("nonce"),
    policy,
  }),
  evidencePolicyCommitment: computeEvidencePolicyCommitment(policy),
  deploymentStatus: "DEPLOYED",
  escrowAddress: escrow,
  createdAt: new Date(0).toISOString(),
  updatedAt: new Date(0).toISOString(),
  policy,
  deliverables: [],
};

class FakeProofVerifier implements CryptographicProofVerifier {
  readonly requests: AttestcoinProofRequest[] = [];

  constructor(private readonly transaction: VerifiedSourceTransaction) {}

  async verify(reference: AttestcoinProofRequest): Promise<ProofVerificationResult> {
    this.requests.push(reference);
    return { ok: true, transaction: this.transaction };
  }
}

class FakeRegistry implements EvidenceClaimRegistryGateway {
  consumed = false;
  boundEscrow = ZeroAddress;
  rejection: Error | undefined;
  returnedClaimId: string | undefined;
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
    return {
      claimId: this.returnedClaimId ?? computeClaimId(claim),
      transactionHash: id("registry transaction"),
    };
  }
}

function transferLog(
  address = token,
  from = seller,
  to = buyer,
  amount = 100000000n,
) {
  return {
    address,
    topics: [transferTopic, zeroPadValue(from, 32), zeroPadValue(to, 32)],
    data: `0x${amount.toString(16).padStart(64, "0")}`,
  };
}

function verifiedTransaction(
  overrides: Partial<VerifiedSourceTransaction> = {},
): VerifiedSourceTransaction {
  const transactionHash = id("condition transaction");
  return {
    sourceChainKey: 1,
    sourceTransactionHash: transactionHash,
    sourceBlockNumber: 100,
    transactionIndex: 0,
    from: seller,
    to: token,
    chainId: "11155111",
    value: "0",
    data: transferInterface.encodeFunctionData("transfer", [buyer, 100000000n]),
    receiptStatus: 1,
    logs: [transferLog()],
    ...overrides,
  };
}

async function setup(transaction = verifiedTransaction()) {
  const agreements = new InMemoryAgreementRepository();
  await agreements.createAgreement(agreement);
  const verifier = new FakeProofVerifier(transaction);
  const registry = new FakeRegistry();
  const service = new AgreementConditionService(
    agreements,
    new InMemoryAgreementConditionVerificationRepository(),
    verifier,
    new SourceTransactionPolicyEvaluator(),
    registry,
  );
  return { agreements, service, verifier, registry };
}

function rejection(reason: unknown): AgreementConditionServiceError {
  expect(reason).toBeInstanceOf(AgreementConditionServiceError);
  return reason as AgreementConditionServiceError;
}

describe("agreement condition service", () => {
  it("lets buyer, seller, and arbitrator view the immutable condition", async () => {
    const { service } = await setup();

    for (const wallet of [buyer, seller, arbitrator]) {
      await expect(service.get(agreementId, wallet)).resolves.toMatchObject({
        condition: {
          kind: "external_blockchain_action",
          sourceChainKey: 1,
          assetType: "erc20",
          tokenContract: token,
          expectedSender: seller,
          expectedRecipient: buyer,
          amount: "100000000",
          amountRule: "exact",
          requireSuccess: true,
        },
      });
    }
    await expect(service.get(agreementId, unrelated)).rejects.toSatisfy(
      (reason: unknown) => rejection(reason).status === 403,
    );
  });

  it("lets only the seller submit and records a verified agreement-bound claim", async () => {
    const { agreements, service, verifier, registry } = await setup();
    const updateDeploymentStatus = vi.spyOn(agreements, "updateDeploymentStatus");
    const recordReconciliation = vi.spyOn(agreements, "recordReconciliation");
    const transactionHash = verifiedTransaction().sourceTransactionHash;

    await expect(service.verify(agreementId, buyer, transactionHash)).rejects.toSatisfy(
      (reason: unknown) => rejection(reason).status === 403,
    );
    await expect(service.verify(agreementId, unrelated, transactionHash)).rejects.toSatisfy(
      (reason: unknown) => rejection(reason).status === 403,
    );

    const result = await service.verify(agreementId, seller, transactionHash);
    expect(result).toMatchObject({
      agreementId,
      submitter: seller,
      transactionHash,
      status: "verified",
      verifiedClaimId: expect.any(String),
      verifiedAmount: "100000000",
    });
    expect(verifier.requests[0]).toMatchObject({
      escrowAddress: escrow,
      agreementCommitment: agreement.agreementCommitment,
      evidencePolicyCommitment: agreement.evidencePolicyCommitment,
      sourceChainKey: policy.sourceChainKey,
      transactionHash,
      subject: policy.expectedSender,
      policy,
    });
    expect(registry.submitted).toMatchObject({
      escrow,
      agreementCommitment: agreement.agreementCommitment,
      evidencePolicyCommitment: agreement.evidencePolicyCommitment,
      sourceTransactionHash: transactionHash,
      subject: seller,
    });
    expect(result.verifiedClaimId).toBe(
      registry.submitted ? computeClaimId(registry.submitted) : undefined,
    );
    expect(updateDeploymentStatus).not.toHaveBeenCalled();
    expect(recordReconciliation).not.toHaveBeenCalled();
    expect((await agreements.getAgreementById(agreementId))?.policy).toEqual(policy);
  });

  it("rejects invalid senders, recipients, tokens, amounts, and failed transactions", async () => {
    const cases = [
      { override: { from: unrelated }, code: "SUBJECT_MISMATCH" },
      {
        override: {
          data: transferInterface.encodeFunctionData("transfer", [unrelated, 100000000n]),
          logs: [transferLog(token, seller, unrelated)],
        },
        code: "WRONG_CALLDATA",
      },
      { override: { logs: [transferLog(unrelated)] }, code: "WRONG_ASSET" },
      {
        override: {
          data: transferInterface.encodeFunctionData("transfer", [buyer, 100000000n]),
          logs: [transferLog(token, seller, buyer, 99999999n)],
        },
        code: "WRONG_AMOUNT",
      },
      { override: { receiptStatus: 0 }, code: "WRONG_EVENT" },
    ];

    for (const testCase of cases) {
      const { service } = await setup(verifiedTransaction(testCase.override));
      const result = await service.verify(
        agreementId,
        seller,
        verifiedTransaction(testCase.override).sourceTransactionHash,
      );
      expect(result).toMatchObject({
        status: "verification_failed",
        failureCode: testCase.code,
      });
    }
  });

  it("uses registry replay protection and rejects claims bound to another agreement", async () => {
    const transactionHash = verifiedTransaction().sourceTransactionHash;

    const consumed = await setup();
    consumed.registry.consumed = true;
    await expect(
      consumed.service.verify(agreementId, seller, transactionHash),
    ).resolves.toMatchObject({
      status: "verification_failed",
      failureCode: "REPLAY_DETECTED",
    });
    expect(consumed.registry.submitted).toBeUndefined();

    const bound = await setup();
    bound.registry.boundEscrow = unrelated;
    await expect(
      bound.service.verify(agreementId, seller, transactionHash),
    ).resolves.toMatchObject({
      status: "verification_failed",
      failureCode: "REPLAY_DETECTED",
    });
    expect(bound.registry.submitted).toBeUndefined();

    const rejected = await setup();
    rejected.registry.rejection = new Error("registry rejected");
    await expect(
      rejected.service.verify(agreementId, seller, transactionHash),
    ).resolves.toMatchObject({
      status: "verification_failed",
      failureCode: "REGISTRY_REJECTION",
    });

    const mismatched = await setup();
    mismatched.registry.returnedClaimId = id("other claim");
    await expect(
      mismatched.service.verify(agreementId, seller, transactionHash),
    ).resolves.toMatchObject({
      status: "verification_failed",
      failureCode: "REGISTRY_REJECTION",
    });
  });
});
