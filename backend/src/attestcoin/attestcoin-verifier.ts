import type {
  AttestcoinProofRequest,
  AttestcoinVerificationResult,
  VerificationFailureCode,
  VerifiedEvidenceClaim,
  VerifiedConditionFacts,
} from "@veyronis/shared";
import {
  computeEvidencePolicyCommitment,
  evidencePolicySchema,
} from "@veyronis/shared";
import { AbiCoder, ZeroAddress, ZeroHash, getAddress, keccak256 } from "ethers";
import type {
  CryptographicProofVerifier,
  EscrowContextReader,
  EvidenceClaimRegistryGateway,
  EvidencePolicyEvaluator,
  RegistrySubmission,
} from "./verifier-types.js";

const AWAITING_DELIVERY_STATE = 1;
const DISPUTED_STATE = 3;
const coder = AbiCoder.defaultAbiCoder();

interface AttestcoinDiagnosticLogger {
  info(message: string, details?: Record<string, unknown>): void;
}

export class AttestcoinVerifier {
  constructor(
    private readonly proofVerifier: CryptographicProofVerifier,
    private readonly policyEvaluator: EvidencePolicyEvaluator,
    private readonly escrowReader: EscrowContextReader,
    private readonly registry: EvidenceClaimRegistryGateway,
    private readonly logger: AttestcoinDiagnosticLogger = console,
  ) {}

  async verifyAndSubmit(
    request: AttestcoinProofRequest,
  ): Promise<AttestcoinVerificationResult> {
    const submissionMode = request.conditionSubmission ?? "dispute_evidence";
    const parsedPolicy = evidencePolicySchema.safeParse(request.policy);
    if (!parsedPolicy.success) {
      return failure(
        "INVALID_POLICY",
        "The supplied evidence policy is invalid",
      );
    }
    const policy = parsedPolicy.data;
    if (
      !sameHex(
        computeEvidencePolicyCommitment(policy),
        request.evidencePolicyCommitment,
      )
    ) {
      return failure(
        "POLICY_COMMITMENT_MISMATCH",
        "The evidence policy commitment does not match",
      );
    }
    if (policy.sourceChainKey !== request.sourceChainKey) {
      return failure(
        "UNSUPPORTED_SOURCE_CHAIN",
        "The policy source chain does not match the request",
      );
    }
    if (!sameHex(policy.evidenceType, request.evidenceType)) {
      return failure(
        "EVIDENCE_TYPE_MISMATCH",
        "The policy evidence type does not match the request",
      );
    }
    if (!sameAddress(policy.expectedSender, request.subject)) {
      return failure(
        "SUBJECT_MISMATCH",
        "The policy sender does not match the requested subject",
      );
    }

    const proofResult = await this.proofVerifier.verify(request);
    if (!proofResult.ok) return proofResult;

    const transaction = proofResult.transaction;
    if (transaction.sourceChainKey !== request.sourceChainKey) {
      return failure(
        "UNSUPPORTED_SOURCE_CHAIN",
        "Verified source chain does not match the request",
      );
    }
    if (!sameHex(transaction.sourceTransactionHash, request.transactionHash)) {
      return failure(
        "TRANSACTION_HASH_MISMATCH",
        "Verified transaction hash does not match the request",
      );
    }

    const policyResult = this.policyEvaluator.evaluate(transaction, policy);
    if (!policyResult.ok) return policyResult;
    const interpreted = policyResult.evidence;
    if (!sameHex(interpreted.evidenceType, request.evidenceType)) {
      return failure(
        "EVIDENCE_TYPE_MISMATCH",
        "Verified evidence type does not match the request",
      );
    }
    if (!sameAddress(interpreted.subject, request.subject)) {
      return failure(
        "SUBJECT_MISMATCH",
        "Verified transaction subject does not match the request",
      );
    }

    const computedCommitment = computeEvidenceCommitment(
      request.evidencePolicyCommitment,
      interpreted.evidenceType,
      transaction.sourceChainKey,
      transaction.sourceTransactionHash,
      interpreted.subject,
    );
    if (!sameHex(computedCommitment, request.evidenceCommitment)) {
      return failure(
        "EVIDENCE_COMMITMENT_MISMATCH",
        "Normalized evidence does not produce the dispute commitment",
      );
    }

    const claim: VerifiedEvidenceClaim = {
      escrow: getAddress(request.escrowAddress),
      agreementCommitment: request.agreementCommitment,
      evidencePolicyCommitment: request.evidencePolicyCommitment,
      evidenceCommitment: computedCommitment,
      evidenceType: interpreted.evidenceType,
      sourceChainKey: transaction.sourceChainKey,
      sourceTransactionHash: transaction.sourceTransactionHash,
      subject: getAddress(interpreted.subject),
    };
    const claimId = computeClaimId(claim);
    const sourceEvidenceKey = computeSourceEvidenceKey(claim);
    let claimAlreadySubmitted = false;
    try {
      const [consumed, boundEscrow] = await Promise.all([
        this.registry.isClaimConsumed(claimId),
        this.registry.sourceEvidenceEscrow(sourceEvidenceKey),
      ]);
      claimAlreadySubmitted = sameAddress(boundEscrow, claim.escrow);
      if (
        (consumed || !sameAddress(boundEscrow, ZeroAddress)) &&
        !claimAlreadySubmitted
      ) {
        return failure(
          "REPLAY_DETECTED",
          "The normalized evidence was already consumed or bound",
        );
      }
    } catch (error) {
      this.log("claim.idempotency_check_failed", {
        claimId,
        error: error instanceof Error ? error.message : String(error),
      });
      return failure(
        "AUTHORIZED_CLAIM_FAILED",
        "The authorized claim could not be checked",
      );
    }

    let escrow;
    try {
      escrow = await this.escrowReader.readDisputeContext(
        request.escrowAddress,
      );
    } catch {
      return failure(
        "PROVIDER_FAILURE",
        "Failed to read the escrow dispute context",
      );
    }
    if (!sameAddress(escrow.escrowAddress, request.escrowAddress)) {
      return failure(
        "ESCROW_MISMATCH",
        "The loaded escrow context belongs to another address",
      );
    }
    if (!sameHex(escrow.agreementCommitment, request.agreementCommitment)) {
      return failure(
        "AGREEMENT_COMMITMENT_MISMATCH",
        "The escrow agreement does not match the request",
      );
    }
    if (
      !sameHex(
        escrow.evidencePolicyCommitment,
        request.evidencePolicyCommitment,
      )
    ) {
      return failure(
        "POLICY_COMMITMENT_MISMATCH",
        "The escrow commits to another evidence policy",
      );
    }
    const conditionMode = submissionMode !== "dispute_evidence";
    if (conditionMode) {
      if (
        (submissionMode === "direct_settlement") !==
        escrow.directConditionSettlement
      ) {
        return failure(
          "ESCROW_NOT_SETTLEABLE",
          "The escrow settlement mode does not match the verified condition",
        );
      }
      if (!claimAlreadySubmitted && escrow.state !== AWAITING_DELIVERY_STATE) {
        return failure(
          "ESCROW_NOT_SETTLEABLE",
          "The escrow is not awaiting a verified condition",
        );
      }
      if (
        !claimAlreadySubmitted &&
        !sameHex(escrow.activeEvidenceCommitment, ZeroHash)
      ) {
        return failure(
          "EVIDENCE_COMMITMENT_MISMATCH",
          "The escrow already has active evidence",
        );
      }
    } else {
      if (
        !sameHex(escrow.activeEvidenceCommitment, request.evidenceCommitment)
      ) {
        return failure(
          "EVIDENCE_COMMITMENT_MISMATCH",
          "The active dispute commitment does not match the request",
        );
      }
      if (escrow.state !== DISPUTED_STATE) {
        return failure(
          "ESCROW_NOT_SETTLEABLE",
          "The escrow is not in a verifiable state",
        );
      }
    }
    if (
      !sameAddress(request.subject, escrow.buyer) &&
      !sameAddress(request.subject, escrow.seller)
    ) {
      return failure(
        "SUBJECT_MISMATCH",
        "The verified subject is not an escrow participant",
      );
    }

    const verifiedFacts: VerifiedConditionFacts = {
      sourceChainKey: transaction.sourceChainKey,
      sourceTransactionHash: transaction.sourceTransactionHash,
      sourceBlockNumber: transaction.sourceBlockNumber,
      chainId: transaction.chainId,
      sender: getAddress(transaction.from),
      recipient: getAddress(policy.expectedRecipient),
      asset:
        policy.assetKind === "native" ? "Native asset" : policy.expectedAsset,
      amount: interpreted.amount,
      transactionIncluded: true,
      transactionSucceeded: true,
      conditionMatch: true,
    };
    try {
      this.log("claim.idempotency", {
        claimId,
        submissionMode,
        claimAlreadySubmitted,
      });
      let submission: RegistrySubmission | undefined;
      if (!claimAlreadySubmitted) {
        try {
          submission =
            submissionMode === "direct_settlement"
              ? await this.registry.submitVerifiedConditionClaim(claim)
              : submissionMode === "prerequisite_record"
                ? await this.registry.submitVerifiedPrerequisiteClaim(claim)
                : await this.registry.submitVerifiedClaim(claim);
          this.log("claim.submission", {
            claimId,
            submissionMode,
            registryTransactionHash: submission.transactionHash,
          });
        } catch (error) {
          this.log("claim.submission_failed", {
            claimId,
            submissionMode,
            error: error instanceof Error ? error.message : String(error),
          });
          return failure(
            "AUTHORIZED_CLAIM_FAILED",
            "The authorized EvidenceClaimRegistry submission failed",
          );
        }
      }
      const acceptedClaimId = submission?.claimId ?? claimId;
      if (submissionMode === "direct_settlement") {
        let settlement;
        try {
          settlement = await this.escrowReader.readSettlementContext(
            request.escrowAddress,
          );
        } catch (error) {
          this.log("escrow.settlement_read_failed", {
            claimId,
            error: error instanceof Error ? error.message : String(error),
          });
          return failure(
            "ESCROW_SETTLEMENT_FAILED",
            "The escrow settlement state could not be read",
          );
        }
        const settled =
          settlement.state === 4 &&
          sameHex(settlement.verifiedClaimId, acceptedClaimId) &&
          settlement.sellerWithdrawal > 0n;
        this.log("escrow.settlement", {
          claimId: acceptedClaimId,
          submissionMode,
          escrowState: settlement.state,
          verifiedClaimId: settlement.verifiedClaimId,
          sellerWithdrawal: settlement.sellerWithdrawal.toString(),
          settled,
        });
        if (!settled) {
          return failure(
            "ESCROW_SETTLEMENT_FAILED",
            "The escrow did not credit the seller for the verified condition",
          );
        }
      } else {
        if (submissionMode === "prerequisite_record") {
          let settlement;
          try {
            settlement = await this.escrowReader.readSettlementContext(
              request.escrowAddress,
            );
          } catch (error) {
            this.log("escrow.settlement_read_failed", {
              claimId,
              error: error instanceof Error ? error.message : String(error),
            });
            return failure(
              "ESCROW_SETTLEMENT_FAILED",
              "The escrow prerequisite state could not be read",
            );
          }
          const recorded =
            settlement.state === 1 &&
            sameHex(settlement.verifiedClaimId, acceptedClaimId) &&
            sameHex(settlement.activeEvidenceCommitment, ZeroHash) &&
            settlement.sellerWithdrawal === 0n;
          this.log("escrow.settlement", {
            claimId: acceptedClaimId,
            submissionMode,
            escrowState: settlement.state,
            verifiedClaimId: settlement.verifiedClaimId,
            activeEvidenceCommitment: settlement.activeEvidenceCommitment,
            sellerWithdrawal: settlement.sellerWithdrawal.toString(),
            recorded,
          });
          if (!recorded) {
            return failure(
              "ESCROW_SETTLEMENT_FAILED",
              "The escrow did not record the verified condition without settlement",
            );
          }
          return {
            ok: true,
            claim,
            claimId: acceptedClaimId,
            transactionHash:
              submission?.transactionHash ?? request.transactionHash,
            verifiedAmount: interpreted.amount,
            verifiedFacts,
          };
        }
        let verifiedClaimId;
        try {
          verifiedClaimId = await this.escrowReader.readVerifiedClaimId(
            request.escrowAddress,
          );
        } catch (error) {
          this.log("escrow.verified_claim_read_failed", {
            claimId,
            error: error instanceof Error ? error.message : String(error),
          });
          return failure(
            "ESCROW_SETTLEMENT_FAILED",
            "The escrow verified claim could not be read",
          );
        }
        this.log("escrow.verified_claim", {
          claimId: acceptedClaimId,
          verifiedClaimId,
        });
        if (!sameHex(verifiedClaimId, acceptedClaimId)) {
          return failure(
            "ESCROW_SETTLEMENT_FAILED",
            "The escrow did not record the accepted claim",
          );
        }
      }
      return {
        ok: true,
        claim,
        claimId: acceptedClaimId,
        transactionHash: submission?.transactionHash ?? request.transactionHash,
        verifiedAmount: interpreted.amount,
        verifiedFacts,
      };
    } catch {
      return failure(
        "AUTHORIZED_CLAIM_FAILED",
        "The authorized claim could not be checked",
      );
    }
  }

  private log(event: string, details: Record<string, unknown>): void {
    this.logger.info(`attestcoin.${event}`, details);
  }
}

export function computeEvidenceCommitment(
  evidencePolicyCommitment: string,
  evidenceType: string,
  sourceChainKey: number,
  sourceTransactionHash: string,
  subject: string,
): string {
  return keccak256(
    coder.encode(
      ["bytes32", "bytes32", "uint64", "bytes32", "address"],
      [
        evidencePolicyCommitment,
        evidenceType,
        sourceChainKey,
        sourceTransactionHash,
        subject,
      ],
    ),
  );
}

export function computeClaimId(claim: VerifiedEvidenceClaim): string {
  return keccak256(
    coder.encode(
      [
        "address",
        "bytes32",
        "bytes32",
        "bytes32",
        "bytes32",
        "uint64",
        "bytes32",
        "address",
      ],
      [
        claim.escrow,
        claim.agreementCommitment,
        claim.evidencePolicyCommitment,
        claim.evidenceCommitment,
        claim.evidenceType,
        claim.sourceChainKey,
        claim.sourceTransactionHash,
        claim.subject,
      ],
    ),
  );
}

export function computeSourceEvidenceKey(claim: VerifiedEvidenceClaim): string {
  return keccak256(
    coder.encode(
      ["bytes32", "uint64", "bytes32", "address"],
      [
        claim.evidenceType,
        claim.sourceChainKey,
        claim.sourceTransactionHash,
        claim.subject,
      ],
    ),
  );
}

export { computeEvidencePolicyCommitment } from "@veyronis/shared";

function sameHex(left: string, right: string): boolean {
  return left.toLowerCase() === right.toLowerCase();
}

function sameAddress(left: string, right: string): boolean {
  try {
    return getAddress(left) === getAddress(right);
  } catch {
    return false;
  }
}

function failure(
  code: VerificationFailureCode,
  message: string,
): AttestcoinVerificationResult {
  return { ok: false, code, message };
}
