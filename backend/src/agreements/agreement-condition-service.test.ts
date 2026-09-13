import { Interface, id, zeroPadValue } from "ethers";
import { describe, expect, it, vi } from "vitest";
import type {
  AgreementMetadata,
  AttestcoinVerificationResult,
  AttestcoinProofRequest,
  EvidencePolicy,
  VerifiedEvidenceClaim,
  VerificationFailureCode,
} from "@veyronis/shared";
import {
  computeAgreementCommitment,
  computeEvidencePolicyCommitment,
} from "@veyronis/shared";
import type {
  AuthorizedConditionVerifier,
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
  agreementMode: "blockchain_condition_only",
  requiredAmount: "100000000000000",
  agreementNonce: id("nonce"),
  agreementCommitment: computeAgreementCommitment({
    buyer,
    seller,
    arbitrator,
    evidenceRegistry: "0x6000000000000000000000000000000000000006",
    agreementMode: "blockchain_condition_only",
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

class FakeAuthorizedVerifier implements AuthorizedConditionVerifier {
  readonly requests: AttestcoinProofRequest[] = [];

  constructor(
    private readonly transaction: VerifiedSourceTransaction,
    private readonly failures: AttestcoinVerificationResult[] = [],
  ) {}

  async verifyAndSubmit(
    reference: AttestcoinProofRequest,
  ): Promise<AttestcoinVerificationResult> {
    this.requests.push(reference);
    const failure = this.failures.shift();
    if (failure) return failure;
    const claim: VerifiedEvidenceClaim = {
      escrow: reference.escrowAddress,
      agreementCommitment: reference.agreementCommitment,
      evidencePolicyCommitment: reference.evidencePolicyCommitment,
      evidenceCommitment: reference.evidenceCommitment,
      evidenceType: reference.evidenceType,
      sourceChainKey: reference.sourceChainKey,
      sourceTransactionHash: reference.transactionHash,
      subject: reference.subject,
    };
    return {
      ok: true,
      claim,
      claimId: id("accepted registry claim"),
      transactionHash: id("registry transaction"),
      verifiedAmount: "100000000",
      verifiedFacts: {
        sourceChainKey: this.transaction.sourceChainKey,
        sourceTransactionHash: this.transaction.sourceTransactionHash,
        sourceBlockNumber: this.transaction.sourceBlockNumber,
        chainId: this.transaction.chainId,
        sender: this.transaction.from,
        recipient: reference.policy.expectedRecipient,
        asset: token,
        amount: "100000000",
        transactionIncluded: true,
        transactionSucceeded: true,
        conditionMatch: true,
      },
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

async function setup(
  transaction = verifiedTransaction(),
  failures: AttestcoinVerificationResult[] = [],
  verifications = new InMemoryAgreementConditionVerificationRepository(),
  metadata: AgreementMetadata = agreement,
) {
  const agreements = new InMemoryAgreementRepository();
  await agreements.createAgreement(metadata);
  const verifier = new FakeAuthorizedVerifier(transaction, failures);
  const service = new AgreementConditionService(
    agreements,
    verifications,
    verifier,
  );
  return { agreements, service, verifier, verifications };
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

  it("lets only the seller trigger the authorized verifier settlement path", async () => {
    const { agreements, service, verifier } = await setup();
    const updateDeploymentStatus = vi.spyOn(
      agreements,
      "updateDeploymentStatus",
    );
    const recordReconciliation = vi.spyOn(agreements, "recordReconciliation");
    const transactionHash = verifiedTransaction().sourceTransactionHash;

    await expect(
      service.verify(agreementId, buyer, transactionHash),
    ).rejects.toSatisfy((reason: unknown) => rejection(reason).status === 403);
    await expect(
      service.verify(agreementId, unrelated, transactionHash),
    ).rejects.toSatisfy((reason: unknown) => rejection(reason).status === 403);

    const result = await service.verify(agreementId, seller, transactionHash);
    expect(result).toMatchObject({
      agreementId,
      submitter: seller,
      transactionHash,
      status: "verified",
      verifiedAmount: "100000000",
      verifiedFacts: {
        sourceChainKey: 1,
        sourceTransactionHash: transactionHash,
        sourceBlockNumber: 100,
        chainId: "11155111",
        sender: seller,
        recipient: buyer,
        asset: token,
        amount: "100000000",
        transactionIncluded: true,
        transactionSucceeded: true,
        conditionMatch: true,
      },
    });
    expect(result.verifiedClaimId).toBe(id("accepted registry claim"));
    expect(verifier.requests[0]).toMatchObject({
      escrowAddress: escrow,
      agreementCommitment: agreement.agreementCommitment,
      evidencePolicyCommitment: agreement.evidencePolicyCommitment,
      sourceChainKey: policy.sourceChainKey,
      transactionHash,
      subject: policy.expectedSender,
      policy,
      conditionSubmission: "direct_settlement",
    });
    expect(updateDeploymentStatus).not.toHaveBeenCalled();
    expect(recordReconciliation).not.toHaveBeenCalled();
    expect((await agreements.getAgreementById(agreementId))?.policy).toEqual(
      policy,
    );
  });

  it("records hybrid conditions without bypassing buyer acceptance", async () => {
    const hybrid: AgreementMetadata = {
      ...agreement,
      agreementMode: "hybrid",
      deliverables: [
        {
          id: "11111111-1111-4111-8111-111111111111",
          title: "Delivery",
          description: "",
          required: true,
          active: true,
          position: 0,
          evidenceRequirements: [
            {
              id: "22222222-2222-4222-8222-222222222222",
              label: "Delivery photo",
              kind: "PHOTO",
              required: true,
              configuration: {},
              position: 0,
            },
          ],
        },
      ],
    };
    const { service, verifier } = await setup(
      verifiedTransaction(),
      [],
      new InMemoryAgreementConditionVerificationRepository(),
      hybrid,
    );

    const result = await service.verify(
      agreementId,
      seller,
      verifiedTransaction().sourceTransactionHash,
    );

    expect(result.status).toBe("verified");
    expect(verifier.requests[0]?.conditionSubmission).toBe(
      "prerequisite_record",
    );
  });

  it("rejects invalid senders, recipients, tokens, amounts, and failed transactions", async () => {
    const cases: {
      override: Partial<VerifiedSourceTransaction>;
      code: VerificationFailureCode;
    }[] = [
      { override: { from: unrelated }, code: "SUBJECT_MISMATCH" },
      {
        override: {
          data: transferInterface.encodeFunctionData("transfer", [
            unrelated,
            100000000n,
          ]),
          logs: [transferLog(token, seller, unrelated)],
        },
        code: "WRONG_CALLDATA",
      },
      { override: { logs: [transferLog(unrelated)] }, code: "WRONG_ASSET" },
      {
        override: {
          data: transferInterface.encodeFunctionData("transfer", [
            buyer,
            100000000n,
          ]),
          logs: [transferLog(token, seller, buyer, 99999999n)],
        },
        code: "WRONG_AMOUNT",
      },
      { override: { receiptStatus: 0 }, code: "WRONG_EVENT" },
    ];

    for (const testCase of cases) {
      const { service } = await setup(verifiedTransaction(testCase.override), [
        { ok: false, code: testCase.code, message: "policy rejection" },
      ]);
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

  it("maps temporary proof failures to a retryable condition state", async () => {
    const transactionHash = verifiedTransaction().sourceTransactionHash;
    const failure: AttestcoinVerificationResult = {
      ok: false,
      code: "INVALID_PROOF",
      message: "raw provider detail",
    };
    const { service, verifier } = await setup(verifiedTransaction(), [failure]);

    await expect(
      service.verify(agreementId, seller, transactionHash),
    ).resolves.toMatchObject({
      status: "verification_failed",
      failureCode: "PROOF_UNAVAILABLE",
    });
    expect(verifier.requests).toHaveLength(1);

    await expect(
      service.verify(agreementId, seller, transactionHash),
    ).resolves.toMatchObject({
      status: "verified",
      verifiedAmount: "100000000",
    });
    expect(verifier.requests).toHaveLength(2);
  });

  it("keeps successful verification idempotent for the same transaction hash", async () => {
    const transactionHash = verifiedTransaction().sourceTransactionHash;
    const { service, verifier } = await setup();

    const first = await service.verify(agreementId, seller, transactionHash);
    const second = await service.verify(agreementId, seller, transactionHash);

    expect(second).toEqual(first);
    expect(verifier.requests).toHaveLength(1);
  });

  it("does not duplicate work while another verification attempt is in progress", async () => {
    const transaction = verifiedTransaction();
    const verifications =
      new InMemoryAgreementConditionVerificationRepository();
    await verifications.startVerification({
      id: "11111111-1111-4111-8111-111111111111",
      agreementId,
      submitter: seller,
      transactionHash: transaction.sourceTransactionHash,
      status: "verification_in_progress",
      submittedAt: new Date(0).toISOString(),
      updatedAt: new Date(0).toISOString(),
    });
    const { service, verifier } = await setup(transaction, [], verifications);

    await expect(
      service.verify(agreementId, seller, transaction.sourceTransactionHash),
    ).resolves.toMatchObject({
      status: "verification_in_progress",
    });
    expect(verifier.requests).toHaveLength(0);
  });

  it("rejects a transaction already verified for another agreement", async () => {
    const transaction = verifiedTransaction();
    const verifications =
      new InMemoryAgreementConditionVerificationRepository();
    const otherAgreement = id("other condition agreement");
    const other = await verifications.startVerification({
      id: "44444444-4444-4444-8444-444444444444",
      agreementId: otherAgreement,
      submitter: seller,
      transactionHash: transaction.sourceTransactionHash,
      status: "verification_in_progress",
      submittedAt: new Date(0).toISOString(),
      updatedAt: new Date(0).toISOString(),
    });
    await verifications.updateVerification(other.verification.id, {
      status: "verified",
      verifiedAmount: "100000000",
      verifiedAt: new Date(1).toISOString(),
      updatedAt: new Date(1).toISOString(),
    });
    const { service, verifier } = await setup(transaction, [], verifications);
    const uppercaseHash = `0x${transaction.sourceTransactionHash
      .slice(2)
      .toUpperCase()}`;

    await expect(
      service.verify(agreementId, seller, uppercaseHash),
    ).rejects.toSatisfy((reason: unknown) => rejection(reason).status === 409);
    expect(verifier.requests).toHaveLength(0);
  });
});
