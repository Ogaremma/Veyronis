import { randomUUID } from "node:crypto";
import { ZeroAddress, getAddress } from "ethers";
import {
  bytes32Schema,
  externalBlockchainConditionFromPolicy,
  type AgreementConditionDetails,
  type AgreementConditionVerification,
  type AgreementMetadata,
  type AttestcoinProofRequest,
  type ParticipantRole,
  type VerifiedEvidenceClaim,
} from "@veyronis/shared";
import {
  computeClaimId,
  computeEvidenceCommitment,
  computeSourceEvidenceKey,
} from "../attestcoin/attestcoin-verifier.js";
import type {
  CryptographicProofVerifier,
  EvidenceClaimRegistryGateway,
  EvidencePolicyEvaluator,
} from "../attestcoin/verifier-types.js";
import type { AgreementRepository } from "./agreement-repository.js";
import type {
  AgreementConditionVerificationRepository,
} from "./agreement-condition-repository.js";

export class AgreementConditionServiceError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

export class AgreementConditionService {
  constructor(
    private readonly agreements: AgreementRepository,
    private readonly verifications: AgreementConditionVerificationRepository,
    private readonly proofVerifier: CryptographicProofVerifier,
    private readonly policyEvaluator: EvidencePolicyEvaluator,
    private readonly registry: EvidenceClaimRegistryGateway,
  ) {}

  async get(
    agreementId: string,
    wallet: string,
  ): Promise<AgreementConditionDetails> {
    const agreement = await this.requireAgreement(agreementId, wallet);
    const condition = externalBlockchainConditionFromPolicy(agreement.policy);
    if (!condition)
      throw new AgreementConditionServiceError(
        404,
        "This agreement does not have an external blockchain condition.",
      );
    const verification = await this.verifications.latestVerification(agreementId);
    return {
      condition,
      ...(verification ? { verification } : {}),
    };
  }

  async verify(
    agreementId: string,
    wallet: string,
    input: unknown,
  ): Promise<AgreementConditionVerification> {
    const agreement = await this.requireAgreement(agreementId, wallet);
    if (getAddress(wallet) !== getAddress(agreement.seller))
      throw new AgreementConditionServiceError(
        403,
        "Only the agreement seller can submit an external transaction.",
      );
    const condition = externalBlockchainConditionFromPolicy(agreement.policy);
    if (!condition)
      throw new AgreementConditionServiceError(
        404,
        "This agreement does not have an external blockchain condition.",
      );

    let transactionHash: string;
    try {
      transactionHash = bytes32Schema.parse(input);
    } catch {
      throw new AgreementConditionServiceError(
        400,
        "A valid transaction hash is required.",
      );
    }

    const now = new Date().toISOString();
    let verification = await this.verifications.createVerification({
      id: randomUUID(),
      agreementId,
      submitter: getAddress(wallet),
      transactionHash,
      status: "verification_in_progress",
      submittedAt: now,
      updatedAt: now,
    });

    const request = this.proofRequest(agreement, transactionHash);
    const proof = await this.proofVerifier.verify(request);
    if (!proof.ok) {
      return this.finishFailure(verification, proof.code, proof.message);
    }

    const evaluation = this.policyEvaluator.evaluate(
      proof.transaction,
      agreement.policy,
    );
    if (!evaluation.ok) {
      return this.finishFailure(
        verification,
        evaluation.code,
        evaluation.message,
      );
    }

    const evidenceCommitment = computeEvidenceCommitment(
      agreement.evidencePolicyCommitment,
      evaluation.evidence.evidenceType,
      proof.transaction.sourceChainKey,
      proof.transaction.sourceTransactionHash,
      evaluation.evidence.subject,
    );
    const claim: VerifiedEvidenceClaim = {
      escrow: getAddress(agreement.escrowAddress!),
      agreementCommitment: agreement.agreementCommitment,
      evidencePolicyCommitment: agreement.evidencePolicyCommitment,
      evidenceCommitment,
      evidenceType: evaluation.evidence.evidenceType,
      sourceChainKey: proof.transaction.sourceChainKey,
      sourceTransactionHash: proof.transaction.sourceTransactionHash,
      subject: getAddress(evaluation.evidence.subject),
    };
    const verifiedClaimId = computeClaimId(claim);
    let registryClaimId: string;
    try {
      const [claimConsumed, boundEscrow] = await Promise.all([
        this.registry.isClaimConsumed(verifiedClaimId),
        this.registry.sourceEvidenceEscrow(computeSourceEvidenceKey(claim)),
      ]);
      if (claimConsumed || boundEscrow !== ZeroAddress) {
        return this.finishFailure(
          verification,
          "REPLAY_DETECTED",
          "The external transaction is already bound to another agreement.",
        );
      }
      const submission = await this.registry.submitVerifiedClaim(claim);
      registryClaimId = submission.claimId;
    } catch {
      return this.finishFailure(
        verification,
        "REGISTRY_REJECTION",
        "The EvidenceClaimRegistry rejected the verified condition.",
      );
    }
    if (registryClaimId.toLowerCase() !== verifiedClaimId.toLowerCase()) {
      return this.finishFailure(
        verification,
        "REGISTRY_REJECTION",
        "The EvidenceClaimRegistry returned another verified claim.",
      );
    }

    const verifiedAt = new Date().toISOString();
    const updated = await this.verifications.updateVerification(
      verification.id,
      {
        status: "verified",
        verifiedClaimId,
        verifiedAmount: evaluation.evidence.amount,
        verifiedAt,
        updatedAt: verifiedAt,
      },
    );
    if (!updated)
      throw new AgreementConditionServiceError(
        409,
        "The condition verification could not be updated.",
      );
    verification = updated;
    return verification;
  }

  private async finishFailure(
    verification: AgreementConditionVerification,
    code: string,
    message: string,
  ): Promise<AgreementConditionVerification> {
    const updatedAt = new Date().toISOString();
    const updated = await this.verifications.updateVerification(
      verification.id,
      {
        status: "verification_failed",
        failureCode: code,
        failureMessage: message,
        updatedAt,
      },
    );
    if (!updated)
      throw new AgreementConditionServiceError(
        409,
        "The condition verification could not be updated.",
      );
    return updated;
  }

  private proofRequest(
    agreement: AgreementMetadata,
    transactionHash: string,
  ): AttestcoinProofRequest {
    return {
      escrowAddress: getAddress(agreement.escrowAddress!),
      agreementCommitment: agreement.agreementCommitment,
      evidencePolicyCommitment: agreement.evidencePolicyCommitment,
      evidenceCommitment: computeEvidenceCommitment(
        agreement.evidencePolicyCommitment,
        agreement.policy.evidenceType,
        agreement.policy.sourceChainKey,
        transactionHash,
        agreement.policy.expectedSender,
      ),
      evidenceType: agreement.policy.evidenceType,
      sourceChainKey: agreement.policy.sourceChainKey,
      transactionHash,
      subject: agreement.policy.expectedSender,
      policy: agreement.policy,
    };
  }

  private async requireAgreement(
    agreementId: string,
    wallet: string,
  ): Promise<AgreementMetadata> {
    const agreement = await this.agreements.getAgreementById(agreementId);
    if (!agreement)
      throw new AgreementConditionServiceError(404, "Agreement not found.");
    if (agreement.deploymentStatus !== "DEPLOYED" || !agreement.escrowAddress)
      throw new AgreementConditionServiceError(
        409,
        "External conditions require a deployed agreement.",
      );
    if (!roleFor(agreement, wallet))
      throw new AgreementConditionServiceError(
        403,
        "Wallet is not an agreement participant.",
      );
    return agreement;
  }
}

function roleFor(
  agreement: AgreementMetadata,
  wallet: string,
): ParticipantRole | undefined {
  const address = getAddress(wallet);
  if (getAddress(agreement.buyer) === address) return "buyer";
  if (getAddress(agreement.seller) === address) return "seller";
  if (getAddress(agreement.arbitrator) === address) return "arbitrator";
  return undefined;
}
