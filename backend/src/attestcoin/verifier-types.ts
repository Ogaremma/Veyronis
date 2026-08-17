import type {
  AttestcoinProofRequest,
  VerificationFailureCode,
  VerifiedEvidenceClaim,
} from "@veyronis/shared";

export interface VerifiedSourceTransaction {
  sourceChainKey: number;
  sourceTransactionHash: string;
  sourceBlockNumber: number;
  transactionIndex: number;
  from: string;
  to: string | null;
}

export type ProofVerificationResult =
  | { ok: true; transaction: VerifiedSourceTransaction }
  | { ok: false; code: VerificationFailureCode; message: string };

export interface CryptographicProofVerifier {
  verify(reference: AttestcoinProofRequest): Promise<ProofVerificationResult>;
}

export interface InterpretedEvidence {
  evidenceType: string;
  subject: string;
}

export interface VerifiedEvidenceInterpreter {
  interpret(transaction: VerifiedSourceTransaction): InterpretedEvidence;
}

export interface EscrowDisputeContext {
  escrowAddress: string;
  agreementCommitment: string;
  activeEvidenceCommitment: string;
  buyer: string;
  seller: string;
  state: number;
}

export interface EscrowContextReader {
  readDisputeContext(escrowAddress: string): Promise<EscrowDisputeContext>;
}

export interface RegistrySubmission {
  claimId: string;
  transactionHash: string;
}

export interface EvidenceClaimRegistryGateway {
  isClaimConsumed(claimId: string): Promise<boolean>;
  sourceEvidenceEscrow(sourceEvidenceKey: string): Promise<string>;
  submitVerifiedClaim(claim: VerifiedEvidenceClaim): Promise<RegistrySubmission>;
}
