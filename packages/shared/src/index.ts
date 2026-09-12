import { z } from "zod";
import { AbiCoder, id, keccak256, toUtf8Bytes, ZeroHash } from "ethers";

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

export const externalBlockchainConditionSchema = z
  .object({
    kind: z.literal("external_blockchain_action"),
    sourceChainKey: z.number().int().positive(),
    assetType: z.enum(["native", "erc20"]),
    tokenContract: addressSchema.optional(),
    expectedSender: addressSchema,
    expectedRecipient: addressSchema,
    amount: uint256StringSchema,
    amountRule: z.enum(["exact", "minimum"]),
    requireSuccess: z.boolean(),
  })
  .superRefine((condition, context) => {
    if (condition.assetType === "erc20" && !condition.tokenContract) {
      context.addIssue({
        code: "custom",
        message: "ERC-20 conditions require a token contract",
      });
    }
    if (condition.assetType === "native" && condition.tokenContract) {
      context.addIssue({
        code: "custom",
        message: "Native conditions cannot specify a token contract",
      });
    }
    if (!condition.requireSuccess) {
      context.addIssue({
        code: "custom",
        message: "External blockchain conditions require a successful transaction",
      });
    }
  });
export type ExternalBlockchainCondition = z.infer<
  typeof externalBlockchainConditionSchema
>;

export const BLOCKCHAIN_CONDITION_DISABLED_EVIDENCE_TYPE = id(
  "BLOCKCHAIN_VERIFICATION_DISABLED",
);

export function externalBlockchainConditionFromPolicy(
  policy: EvidencePolicy,
): ExternalBlockchainCondition | undefined {
  if (policy.evidenceType === BLOCKCHAIN_CONDITION_DISABLED_EVIDENCE_TYPE) {
    return undefined;
  }
  return {
    kind: "external_blockchain_action",
    sourceChainKey: policy.sourceChainKey,
    assetType: policy.assetKind,
    ...(policy.assetKind === "erc20"
      ? { tokenContract: policy.expectedAsset }
      : {}),
    expectedSender: policy.expectedSender,
    expectedRecipient: policy.expectedRecipient,
    amount: policy.amount,
    amountRule: policy.amountRule,
    requireSuccess: true,
  };
}

export const deploymentStatusSchema = z.enum([
  "DRAFT",
  "AWAITING_CONFIRMATION",
  "DEPLOYING",
  "DEPLOYED",
  "FAILED",
]);
export type DeploymentStatus = z.infer<typeof deploymentStatusSchema>;

export const workEvidenceKindSchema = z.enum([
  "PHOTO",
  "FILE",
  "PDF",
  "URL",
  "GITHUB_REPOSITORY",
  "GITHUB_COMMIT",
  "TRACKING_URL",
  "RECEIPT",
  "TEXT",
  "TRANSACTION_HASH",
]);
export type WorkEvidenceKind = z.infer<typeof workEvidenceKindSchema>;

export const evidenceRequirementSchema = z.object({
  id: z.string().uuid(),
  label: z.string().min(1).max(160),
  kind: workEvidenceKindSchema,
  required: z.boolean(),
  configuration: z.record(z.string(), z.string()).default({}),
  position: z.number().int().min(0).max(999),
});
export type AgreementEvidenceRequirement = z.infer<
  typeof evidenceRequirementSchema
>;

export const agreementDeliverableSchema = z.object({
  id: z.string().uuid(),
  title: z.string().min(1).max(160),
  description: z.string().max(2000).default(""),
  required: z.boolean(),
  active: z.boolean(),
  position: z.number().int().min(0).max(999),
  evidenceRequirements: z.array(evidenceRequirementSchema).max(20).default([]),
});
export type AgreementDeliverable = z.infer<typeof agreementDeliverableSchema>;

export const agreementDraftSchema = z.object({
  buyer: addressSchema,
  seller: addressSchema,
  arbitrator: addressSchema,
  requiredAmount: uint256StringSchema,
  agreementNonce: bytes32Schema,
  evidenceRegistry: addressSchema,
  policy: evidencePolicySchema,
  deliverables: z.array(agreementDeliverableSchema).max(50).optional(),
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

export const escrowStateSchema = z.enum([
  "AwaitingPayment",
  "AwaitingDelivery",
  "RefundRequested",
  "Disputed",
  "Complete",
  "Refunded",
  "Cancelled",
]);
export type EscrowState = z.infer<typeof escrowStateSchema>;

export const participantRoleSchema = z.enum(["buyer", "seller", "arbitrator"]);
export type ParticipantRole = z.infer<typeof participantRoleSchema>;

export const workEvidenceSubmissionInputSchema = z.object({
  requirementId: z.string().uuid(),
  value: z.string().min(1).max(2048),
  contentHash: z.string().max(128).optional(),
  mimeType: z.string().max(128).optional(),
  byteSize: uint64StringSchema.optional(),
});
export type WorkEvidenceSubmissionInput = z.infer<
  typeof workEvidenceSubmissionInputSchema
>;

export const workEvidenceReviewSchema = z.object({
  status: z.enum(["accepted", "rejected"]),
  reviewNote: z.string().max(1000).optional(),
});
export type WorkEvidenceReview = z.infer<typeof workEvidenceReviewSchema>;

export const agreementConditionStatusSchema = z.enum([
  "pending",
  "verification_in_progress",
  "verified",
  "verification_failed",
]);
export type AgreementConditionStatus = z.infer<
  typeof agreementConditionStatusSchema
>;

export interface AgreementConditionVerification {
  id: string;
  agreementId: string;
  submitter: string;
  transactionHash: string;
  status: AgreementConditionStatus;
  verifiedClaimId?: string;
  verifiedAmount?: string;
  failureCode?: string;
  failureMessage?: string;
  submittedAt: string;
  verifiedAt?: string;
  updatedAt: string;
}

export interface AgreementConditionDetails {
  condition: ExternalBlockchainCondition;
  verification?: AgreementConditionVerification;
}

export interface WorkEvidenceSubmission
  extends WorkEvidenceSubmissionInput {
  id: string;
  agreementId: string;
  submitter: string;
  status: "submitted" | "accepted" | "rejected";
  reviewNote?: string;
  submittedAt: string;
  reviewedAt?: string;
  updatedAt: string;
}

export const agreementActionSchema = z.enum([
  "deposit",
  "cancel",
  "confirmDelivery",
  "requestRefund",
  "approveRefund",
  "openDispute",
  "resolveRelease",
  "resolveRefund",
  "withdraw",
]);
export type AgreementAction = z.infer<typeof agreementActionSchema>;

export interface AgreementTimelineEvent {
  transactionHash: string;
  blockNumber: string;
  logIndex: number;
  name: string;
  actor?: string;
  amount?: string;
  evidenceCommitment?: string;
  claimId?: string;
  resolution?: "ReleaseToSeller" | "RefundBuyer";
  advisory: boolean;
  timestamp?: string;
}

export interface AgreementChainSnapshot {
  escrowAddress: string;
  buyer: string;
  seller: string;
  arbitrator: string;
  requiredAmount: string;
  agreementCommitment: string;
  evidencePolicyCommitment: string;
  state: EscrowState;
  depositedAmount: string;
  activeEvidenceCommitment: string;
  verifiedClaimId: string;
  withdrawalAmount: string;
  blockNumber: string;
}

export type TransactionStatus =
  | "IDLE"
  | "AWAITING_WALLET_SIGNATURE"
  | "TRANSACTION_SUBMITTED"
  | "CONFIRMING"
  | "CONFIRMED"
  | "RECONCILING"
  | "COMPLETE"
  | "USER_REJECTED"
  | "TRANSACTION_REVERTED"
  | "RPC_ERROR"
  | "RECONCILIATION_FAILED";

export interface TransactionReceiptInfo {
  hash?: string;
  status: TransactionStatus;
  blockNumber?: string;
  confirmations?: number;
  error?: string;
  explorerUrl?: string;
}

export interface AgreementDashboardItem {
  metadata: AgreementMetadata;
  role: ParticipantRole;
  chain?: AgreementChainSnapshot;
}

export interface AgreementDetails extends AgreementDashboardItem {
  timeline: AgreementTimelineEvent[];
  actions: AgreementAction[];
  reconciliation?: {
    status: "MATCHED" | "METADATA_STALE";
    authoritativeSource: "BLOCKCHAIN";
    mismatches: string[];
    checkedAtBlock: string;
  };
}

const commitmentCoder = AbiCoder.defaultAbiCoder();

/** Canonical application-level work evidence subcommitment. */
export function computeWorkEvidenceCommitment(
  deliverables: readonly AgreementDeliverable[] = [],
): string {
  if (deliverables.length === 0) return ZeroHash;
  const canonical = sortDeliverables(deliverables).map((deliverable) => ({
    id: deliverable.id,
    title: deliverable.title,
    description: deliverable.description,
    required: deliverable.required,
    active: deliverable.active,
    position: deliverable.position,
    evidenceRequirements: sortRequirements(
      deliverable.evidenceRequirements,
    ).map((requirement) => ({
      id: requirement.id,
      label: requirement.label,
      kind: requirement.kind,
      required: requirement.required,
      configuration: canonicalConfiguration(requirement.configuration),
      position: requirement.position,
    })),
  }));
  return keccak256(toUtf8Bytes(canonicalJson(canonical)));
}

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
  const participantsAndTermsCommitment = keccak256(
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
  const workEvidenceCommitment = computeWorkEvidenceCommitment(
    draft.deliverables ?? [],
  );
  if (workEvidenceCommitment === ZeroHash)
    return participantsAndTermsCommitment;
  return keccak256(
    commitmentCoder.encode(
      ["bytes32", "bytes32"],
      [participantsAndTermsCommitment, workEvidenceCommitment],
    ),
  );
}

function sortDeliverables(
  deliverables: readonly AgreementDeliverable[],
): AgreementDeliverable[] {
  return [...deliverables].sort(
    (left, right) =>
      left.position - right.position || left.id.localeCompare(right.id),
  );
}

function sortRequirements(
  requirements: readonly AgreementEvidenceRequirement[],
): AgreementEvidenceRequirement[] {
  return [...requirements].sort(
    (left, right) =>
      left.position - right.position || left.id.localeCompare(right.id),
  );
}

function canonicalConfiguration(configuration: Record<string, string>) {
  return Object.fromEntries(
    Object.entries(configuration).sort(([left], [right]) =>
      left.localeCompare(right),
    ),
  );
}

function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => `${JSON.stringify(key)}:${canonicalJson(item)}`)
      .join(",")}}`;
  }
  return JSON.stringify(value) ?? "null";
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
