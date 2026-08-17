import { z } from "zod";
import { AbiCoder, keccak256 } from "ethers";

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
  evidencePolicyCommitment: bytes32Schema,
  evidenceCommitment: bytes32Schema,
  evidenceType: bytes32Schema,
  subject: addressSchema,
  policy: z.lazy(() => evidencePolicySchema),
});

export type AttestcoinProofRequest = z.infer<
  typeof attestcoinProofRequestSchema
>;

const uintStringSchema = z.string().regex(/^(0|[1-9][0-9]*)$/);
const uint64StringSchema = uintStringSchema.refine(
  (value) => BigInt(value) <= (1n << 64n) - 1n,
  "Must fit uint64",
);
const uint256StringSchema = uintStringSchema.refine(
  (value) => BigInt(value) <= (1n << 256n) - 1n,
  "Must fit uint256",
);
const bytes4Schema = z.string().regex(/^0x[a-fA-F0-9]{8}$/);
const zeroAddress = "0x0000000000000000000000000000000000000000";
const zeroSelector = "0x00000000";

export const evidencePolicySchema = z
  .object({
    version: z.literal(1),
    evidenceType: bytes32Schema,
    sourceChainKey: z.number().int().positive(),
    assetKind: z.enum(["native", "erc20"]),
    expectedSourceContract: addressSchema,
    expectedRecipient: addressSchema,
    expectedAsset: addressSchema,
    expectedSender: addressSchema,
    amountRule: z.enum(["exact", "minimum"]),
    amount: uint256StringSchema,
    minSourceBlock: uint64StringSchema,
    maxSourceBlock: uint64StringSchema,
    calldataSelector: bytes4Schema,
    requireTransferEvent: z.boolean(),
  })
  .superRefine((policy, context) => {
    if (policy.expectedRecipient.toLowerCase() === zeroAddress) {
      context.addIssue({
        code: "custom",
        message: "Expected recipient is required",
      });
    }
    if (policy.expectedSender.toLowerCase() === zeroAddress) {
      context.addIssue({
        code: "custom",
        message: "Expected sender is required",
      });
    }
    if (BigInt(policy.amount) === 0n) {
      context.addIssue({
        code: "custom",
        message: "Payment amount must be positive",
      });
    }
    if (
      BigInt(policy.maxSourceBlock) !== 0n &&
      BigInt(policy.minSourceBlock) > BigInt(policy.maxSourceBlock)
    ) {
      context.addIssue({
        code: "custom",
        message: "Invalid source block window",
      });
    }
    if (policy.assetKind === "native") {
      if (
        policy.expectedAsset.toLowerCase() !== zeroAddress ||
        policy.requireTransferEvent
      ) {
        context.addIssue({
          code: "custom",
          message: "Native policy cannot require a token event",
        });
      }
    } else if (
      policy.expectedAsset.toLowerCase() === zeroAddress ||
      policy.expectedSourceContract.toLowerCase() === zeroAddress ||
      !policy.requireTransferEvent
    ) {
      context.addIssue({
        code: "custom",
        message: "ERC-20 policy requires token, target, and event",
      });
    }
    if (
      policy.calldataSelector.toLowerCase() !== zeroSelector &&
      policy.calldataSelector.toLowerCase() !== "0xa9059cbb"
    ) {
      context.addIssue({
        code: "custom",
        message: "Unsupported calldata selector",
      });
    }
  });

export type EvidencePolicy = z.infer<typeof evidencePolicySchema>;

export const deploymentStatusSchema = z.enum([
  "DRAFT",
  "AWAITING_CONFIRMATION",
  "DEPLOYING",
  "DEPLOYED",
  "FAILED",
]);
export type DeploymentStatus = z.infer<typeof deploymentStatusSchema>;

export const agreementDraftSchema = z.object({
  buyer: addressSchema,
  seller: addressSchema,
  arbitrator: addressSchema,
  requiredAmount: uint256StringSchema,
  agreementNonce: bytes32Schema,
  evidenceRegistry: addressSchema,
  policy: evidencePolicySchema,
});
export type AgreementDraft = z.infer<typeof agreementDraftSchema>;

export const agreementMetadataSchema = agreementDraftSchema.extend({
  id: bytes32Schema,
  escrowAddress: addressSchema.optional(),
  agreementCommitment: bytes32Schema,
  evidencePolicyCommitment: bytes32Schema,
  deploymentTransactionHash: bytes32Schema.optional(),
  deploymentBlockNumber: uint64StringSchema.optional(),
  deploymentStatus: deploymentStatusSchema,
  deploymentError: z.string().max(500).optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type AgreementMetadata = z.infer<typeof agreementMetadataSchema>;

const commitmentCoder = AbiCoder.defaultAbiCoder();

/** Canonical Phase 5 policy commitment. Field order and widths mirror Solidity exactly. */
export function computeEvidencePolicyCommitment(
  policy: EvidencePolicy,
): string {
  return keccak256(
    commitmentCoder.encode(
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

/** Canonical agreement commitment used by deployment and participant review. */
export function computeAgreementCommitment(
  draft: AgreementDraft,
  policyCommitment = computeEvidencePolicyCommitment(draft.policy),
): string {
  return keccak256(
    commitmentCoder.encode(
      [
        "address",
        "address",
        "address",
        "uint256",
        "bytes32",
        "bytes32",
        "address",
      ],
      [
        draft.buyer,
        draft.seller,
        draft.arbitrator,
        draft.requiredAmount,
        policyCommitment,
        draft.agreementNonce,
        draft.evidenceRegistry,
      ],
    ),
  );
}

export function validateAgreementDraft(input: unknown): AgreementDraft {
  const parsed = agreementDraftSchema.safeParse(input);
  if (!parsed.success) throw new Error("Invalid agreement draft");
  if (
    [
      parsed.data.buyer,
      parsed.data.seller,
      parsed.data.arbitrator,
      parsed.data.evidenceRegistry,
    ].some((address) => address.toLowerCase() === zeroAddress)
  ) {
    throw new Error("Agreement addresses must be nonzero");
  }
  if (/^0x0{64}$/i.test(parsed.data.agreementNonce))
    throw new Error("Agreement nonce must be nonzero");
  if (
    parsed.data.buyer.toLowerCase() === parsed.data.seller.toLowerCase() ||
    parsed.data.buyer.toLowerCase() === parsed.data.arbitrator.toLowerCase() ||
    parsed.data.seller.toLowerCase() === parsed.data.arbitrator.toLowerCase()
  ) {
    throw new Error("Agreement participants must be distinct");
  }
  if (BigInt(parsed.data.requiredAmount) === 0n)
    throw new Error("Required amount must be positive");
  return parsed.data;
}

export const verifiedEvidenceClaimSchema = z.object({
  escrow: addressSchema,
  agreementCommitment: bytes32Schema,
  evidencePolicyCommitment: bytes32Schema,
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
  "POLICY_COMMITMENT_MISMATCH",
  "INVALID_POLICY",
  "WRONG_SOURCE_CONTRACT",
  "WRONG_RECIPIENT",
  "WRONG_ASSET",
  "WRONG_AMOUNT",
  "WRONG_CALLDATA",
  "WRONG_EVENT",
  "STALE_EVIDENCE",
  "MISSING_VERIFIED_FRESHNESS_CONTEXT",
  "ESCROW_NOT_DISPUTABLE",
  "REPLAY_DETECTED",
  "REGISTRY_REJECTION",
  "PROVIDER_FAILURE",
  "CONFIGURATION_MISSING",
]);

export type VerificationFailureCode = z.infer<
  typeof verificationFailureCodeSchema
>;

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
