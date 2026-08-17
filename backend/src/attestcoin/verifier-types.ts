import type {
  AttestcoinProofRequest,
  EvidencePolicy,
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
  chainId: string;
  value: string;
  data: string;
  receiptStatus: number;
  logs: VerifiedSourceLog[];
}

export interface VerifiedSourceLog {
  address: string;
  topics: string[];
  data: string;
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
  amount: string;
}

export type PolicyEvaluationResult =
  | { ok: true; evidence: InterpretedEvidence }
  | { ok: false; code: VerificationFailureCode; message: string };

export interface EvidencePolicyEvaluator {
  evaluate(transaction: VerifiedSourceTransaction, policy: EvidencePolicy): PolicyEvaluationResult;
}

export interface EscrowDisputeContext {
  escrowAddress: string;
  agreementCommitment: string;
  evidencePolicyCommitment: string;
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
