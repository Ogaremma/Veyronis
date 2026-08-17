import type {
  AttestcoinProofRequest,
  AttestcoinVerificationResult,
  VerificationFailureCode,
  VerifiedEvidenceClaim,
} from "@veyronis/shared";
import { AbiCoder, ZeroAddress, getAddress, keccak256 } from "ethers";
import type {
  CryptographicProofVerifier,
  EscrowContextReader,
  EvidenceClaimRegistryGateway,
  VerifiedEvidenceInterpreter,
} from "./verifier-types.js";

const DISPUTED_STATE = 3;
const coder = AbiCoder.defaultAbiCoder();

export class AttestcoinVerifier {
  constructor(
    private readonly proofVerifier: CryptographicProofVerifier,
    private readonly interpreter: VerifiedEvidenceInterpreter,
    private readonly escrowReader: EscrowContextReader,
    private readonly registry: EvidenceClaimRegistryGateway,
  ) {}

  async verifyAndSubmit(request: AttestcoinProofRequest): Promise<AttestcoinVerificationResult> {
    const proofResult = await this.proofVerifier.verify(request);
    if (!proofResult.ok) return proofResult;

    const transaction = proofResult.transaction;
    if (transaction.sourceChainKey !== request.sourceChainKey) {
      return failure("UNSUPPORTED_SOURCE_CHAIN", "Verified source chain does not match the request");
    }
    if (!sameHex(transaction.sourceTransactionHash, request.transactionHash)) {
      return failure("TRANSACTION_HASH_MISMATCH", "Verified transaction hash does not match the request");
    }

    const interpreted = this.interpreter.interpret(transaction);
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
  evidenceType: string,
  sourceChainKey: number,
  sourceTransactionHash: string,
  subject: string,
): string {
  return keccak256(
    coder.encode(
      ["bytes32", "uint64", "bytes32", "address"],
      [evidenceType, sourceChainKey, sourceTransactionHash, subject],
    ),
  );
}

export function computeClaimId(claim: VerifiedEvidenceClaim): string {
  return keccak256(
    coder.encode(
      ["address", "bytes32", "bytes32", "bytes32", "uint64", "bytes32", "address"],
      [
        claim.escrow,
        claim.agreementCommitment,
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
  return computeEvidenceCommitment(
    claim.evidenceType,
    claim.sourceChainKey,
    claim.sourceTransactionHash,
    claim.subject,
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
