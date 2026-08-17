import { z } from "zod";

export const evidenceReferenceSchema = z.object({
  escrowAddress: z.string().regex(/^0x[a-fA-F0-9]{40}$/),
  sourceChainKey: z.number().int().positive(),
  transactionHash: z.string().regex(/^0x[a-fA-F0-9]{64}$/),
});

export type EvidenceReference = z.infer<typeof evidenceReferenceSchema>;

export const bytes32Schema = z.string().regex(/^0x[a-fA-F0-9]{64}$/);
export const addressSchema = z.string().regex(/^0x[a-fA-F0-9]{40}$/);

export const attestcoinProofRequestSchema = evidenceReferenceSchema.extend({
  agreementCommitment: bytes32Schema,
  evidenceCommitment: bytes32Schema,
  evidenceType: bytes32Schema,
  subject: addressSchema,
});

export type AttestcoinProofRequest = z.infer<typeof attestcoinProofRequestSchema>;

export const verifiedEvidenceClaimSchema = z.object({
  escrow: addressSchema,
  agreementCommitment: bytes32Schema,
  evidenceCommitment: bytes32Schema,
  evidenceType: bytes32Schema,
  sourceChainKey: z.number().int().positive(),
  sourceTransactionHash: bytes32Schema,
  subject: addressSchema,
});

export type VerifiedEvidenceClaim = z.infer<typeof verifiedEvidenceClaimSchema>;

export const verificationFailureCodeSchema = z.enum([
  "INVALID_PROOF",
  "PROOF_VERIFICATION_FAILURE",
  "UNSUPPORTED_SOURCE_CHAIN",
  "MISSING_TRANSACTION_CONTEXT",
  "TRANSACTION_HASH_MISMATCH",
  "SUBJECT_MISMATCH",
  "EVIDENCE_TYPE_MISMATCH",
  "ESCROW_MISMATCH",
  "AGREEMENT_COMMITMENT_MISMATCH",
  "EVIDENCE_COMMITMENT_MISMATCH",
  "ESCROW_NOT_DISPUTABLE",
  "REPLAY_DETECTED",
  "REGISTRY_REJECTION",
  "PROVIDER_FAILURE",
  "CONFIGURATION_MISSING",
]);

export type VerificationFailureCode = z.infer<typeof verificationFailureCodeSchema>;

export type AttestcoinVerificationResult =
  | {
      ok: true;
      claim: VerifiedEvidenceClaim;
      claimId: string;
      transactionHash: string;
    }
  | {
      ok: false;
      code: VerificationFailureCode;
      message: string;
    };

export const evidenceClaimStatusSchema = z.enum([
  "pending-proof",
  "proof-verified",
  "submitted",
  "accepted",
  "rejected",
]);

export type EvidenceClaimStatus = z.infer<typeof evidenceClaimStatusSchema>;
