import type {
  AttestcoinProofRequest,
  AttestcoinVerificationResult,
  EvidencePolicy,
  VerificationFailureCode,
  VerifiedEvidenceClaim,
} from "@veyronis/shared";
import { evidencePolicySchema } from "@veyronis/shared";
import { AbiCoder, ZeroAddress, getAddress, keccak256 } from "ethers";
import type {
  CryptographicProofVerifier,
  EscrowContextReader,
  EvidenceClaimRegistryGateway,
  EvidencePolicyEvaluator,
} from "./verifier-types.js";

const DISPUTED_STATE = 3;
const coder = AbiCoder.defaultAbiCoder();

export class AttestcoinVerifier {
  constructor(
    private readonly proofVerifier: CryptographicProofVerifier,
    private readonly policyEvaluator: EvidencePolicyEvaluator,
    private readonly escrowReader: EscrowContextReader,
    private readonly registry: EvidenceClaimRegistryGateway,
  ) {}

  async verifyAndSubmit(request: AttestcoinProofRequest): Promise<AttestcoinVerificationResult> {
    const parsedPolicy = evidencePolicySchema.safeParse(request.policy);
    if (!parsedPolicy.success) {
      return failure("INVALID_POLICY", "The supplied evidence policy is invalid");
    }
    const policy = parsedPolicy.data;
    if (!sameHex(computeEvidencePolicyCommitment(policy), request.evidencePolicyCommitment)) {
      return failure("POLICY_COMMITMENT_MISMATCH", "The evidence policy commitment does not match");
    }
    if (policy.sourceChainKey !== request.sourceChainKey) {
      return failure("UNSUPPORTED_SOURCE_CHAIN", "The policy source chain does not match the request");
    }
    if (!sameHex(policy.evidenceType, request.evidenceType)) {
      return failure("EVIDENCE_TYPE_MISMATCH", "The policy evidence type does not match the request");
    }
    if (!sameAddress(policy.expectedSender, request.subject)) {
      return failure("SUBJECT_MISMATCH", "The policy sender does not match the requested subject");
    }

    const proofResult = await this.proofVerifier.verify(request);
    if (!proofResult.ok) return proofResult;

    const transaction = proofResult.transaction;
    if (transaction.sourceChainKey !== request.sourceChainKey) {
      return failure("UNSUPPORTED_SOURCE_CHAIN", "Verified source chain does not match the request");
    }
    if (!sameHex(transaction.sourceTransactionHash, request.transactionHash)) {
      return failure("TRANSACTION_HASH_MISMATCH", "Verified transaction hash does not match the request");
    }

    const policyResult = this.policyEvaluator.evaluate(transaction, policy);
    if (!policyResult.ok) return policyResult;
    const interpreted = policyResult.evidence;
    if (!sameHex(interpreted.evidenceType, request.evidenceType)) {
      return failure("EVIDENCE_TYPE_MISMATCH", "Verified evidence type does not match the request");
    }
    if (!sameAddress(interpreted.subject, request.subject)) {
      return failure("SUBJECT_MISMATCH", "Verified transaction subject does not match the request");
    }

    let escrow;
    try {
      escrow = await this.escrowReader.readDisputeContext(request.escrowAddress);
    } catch {
      return failure("PROVIDER_FAILURE", "Failed to read the escrow dispute context");
    }
    if (!sameAddress(escrow.escrowAddress, request.escrowAddress)) {
      return failure("ESCROW_MISMATCH", "The loaded escrow context belongs to another address");
    }
    if (!sameHex(escrow.agreementCommitment, request.agreementCommitment)) {
      return failure("AGREEMENT_COMMITMENT_MISMATCH", "The escrow agreement does not match the request");
    }
    if (!sameHex(escrow.evidencePolicyCommitment, request.evidencePolicyCommitment)) {
      return failure("POLICY_COMMITMENT_MISMATCH", "The escrow commits to another evidence policy");
    }
    if (!sameHex(escrow.activeEvidenceCommitment, request.evidenceCommitment)) {
      return failure("EVIDENCE_COMMITMENT_MISMATCH", "The active dispute commitment does not match the request");
    }
    if (escrow.state !== DISPUTED_STATE) {
      return failure("ESCROW_NOT_DISPUTABLE", "The escrow is not in the disputed state");
    }
    if (!sameAddress(request.subject, escrow.buyer) && !sameAddress(request.subject, escrow.seller)) {
      return failure("SUBJECT_MISMATCH", "The verified subject is not an escrow participant");
    }

    const computedCommitment = computeEvidenceCommitment(
      request.evidencePolicyCommitment,
      interpreted.evidenceType,
      transaction.sourceChainKey,
      transaction.sourceTransactionHash,
      interpreted.subject,
    );
    if (!sameHex(computedCommitment, request.evidenceCommitment)) {
      return failure("EVIDENCE_COMMITMENT_MISMATCH", "Normalized evidence does not produce the dispute commitment");
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

    try {
      const [consumed, boundEscrow] = await Promise.all([
        this.registry.isClaimConsumed(claimId),
        this.registry.sourceEvidenceEscrow(sourceEvidenceKey),
      ]);
      if (consumed || !sameAddress(boundEscrow, ZeroAddress)) {
        return failure("REPLAY_DETECTED", "The normalized evidence was already consumed or bound");
      }
      const submission = await this.registry.submitVerifiedClaim(claim);
      return {
        ok: true,
        claim,
        claimId: submission.claimId,
        transactionHash: submission.transactionHash,
      };
    } catch {
      return failure("REGISTRY_REJECTION", "EvidenceClaimRegistry rejected the verified claim");
    }
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
      [evidencePolicyCommitment, evidenceType, sourceChainKey, sourceTransactionHash, subject],
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
      [claim.evidenceType, claim.sourceChainKey, claim.sourceTransactionHash, claim.subject],
    ),
  );
}

export function computeEvidencePolicyCommitment(policy: EvidencePolicy): string {
  return keccak256(
    coder.encode(
      [
        "uint8",
        "bytes32",
        "uint64",
        "uint8",
        "address",
        "address",
        "address",
        "address",
        "uint8",
        "uint256",
        "uint64",
        "uint64",
        "bytes4",
        "bool",
      ],
      [
        policy.version,
        policy.evidenceType,
        policy.sourceChainKey,
        policy.assetKind === "native" ? 0 : 1,
        policy.expectedSourceContract,
        policy.expectedRecipient,
        policy.expectedAsset,
        policy.expectedSender,
        policy.amountRule === "exact" ? 0 : 1,
        policy.amount,
        policy.minSourceBlock,
        policy.maxSourceBlock,
        policy.calldataSelector,
        policy.requireTransferEvent,
      ],
    ),
  );
}

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
