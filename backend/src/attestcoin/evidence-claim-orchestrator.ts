import type {
  EvidenceClaimStatus,
  EvidenceReference,
  VerifiedEvidenceClaim,
} from "@veyronis/shared";

export interface VerifiedProofMetadata {
  sourceChainKey: number;
  sourceTransactionHash: string;
  sourceBlockNumber: number;
}

export interface ClaimSubmissionResult {
  claimId: string;
  transactionHash: string;
}

export interface EvidenceClaimOrchestrator {
  requestProof(reference: EvidenceReference): Promise<VerifiedProofMetadata>;
  normalizeClaim(
    reference: EvidenceReference,
    proof: VerifiedProofMetadata,
  ): Promise<VerifiedEvidenceClaim>;
  submitVerifiedClaim(claim: VerifiedEvidenceClaim): Promise<ClaimSubmissionResult>;
  getClaimStatus(claimId: string): Promise<EvidenceClaimStatus>;
}

// Implementations may coordinate proof and transaction work, but only the
// on-chain registry can accept a claim and only the escrow can settle funds.
