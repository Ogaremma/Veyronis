import {
  agreementLifecycleMode,
  canWithdrawEscrowFunds,
  externalBlockchainConditionFromPolicy,
  hasApplicationEvidenceRequirements,
} from "@veyronis/shared";
import type {
  AgreementConditionVerification,
  AgreementDetails,
  WorkEvidenceSubmission,
} from "@veyronis/shared";

export interface SellerProgressStep {
  label: string;
  status: string;
  tone: "complete" | "current" | "pending" | "inactive";
}

export function sellerProgressSteps(
  detail: AgreementDetails,
  workEvidenceSubmissions: readonly WorkEvidenceSubmission[] = [],
  conditionVerification?: AgreementConditionVerification,
): SellerProgressStep[] {
  const lifecycle = agreementLifecycleMode(detail.metadata);
  const includeWorkEvidence =
    lifecycle !== "blockchain_condition_only" &&
    hasApplicationEvidenceRequirements(detail.metadata);
  const requirements = (detail.metadata.deliverables ?? [])
    .filter((deliverable) => deliverable.active)
    .flatMap((deliverable) => deliverable.evidenceRequirements);
  const requiredRequirementIds = new Set(
    requirements
      .filter((requirement) => requirement.required)
      .map((requirement) => requirement.id),
  );
  const acceptedRequirementIds = new Set(
    workEvidenceSubmissions
      .filter((submission) => submission.status === "accepted")
      .map((submission) => submission.requirementId),
  );
  const evidenceComplete =
    !includeWorkEvidence ||
    (requirements.length > 0 &&
      [...requiredRequirementIds].every((id) =>
        acceptedRequirementIds.has(id),
      ));
  const evidenceSubmitted = workEvidenceSubmissions.some(
    (submission) => submission.status !== "rejected",
  );
  const externalCondition = externalBlockchainConditionFromPolicy(
    detail.metadata.policy,
  );
  const verifiedOnChain =
    externalCondition !== undefined &&
    conditionVerification?.status === "verified" &&
    detail.chain !== undefined &&
    detail.chain.verifiedClaimId === conditionVerification.verifiedClaimId;
  const conditionComplete = !externalCondition || verifiedOnChain;
  const prerequisitesComplete = evidenceComplete && conditionComplete;
  const withdrawable = detail.chain
    ? canWithdrawEscrowFunds(
        detail.role,
        detail.chain.state,
        detail.chain.withdrawalAmount,
      )
    : false;

  const steps: SellerProgressStep[] = [
    { label: "Review agreement terms", status: "Complete", tone: "complete" },
  ];

  if (includeWorkEvidence) {
    steps.push({
      label: "Submit application work evidence",
      status: evidenceComplete
        ? "Complete"
        : evidenceSubmitted
          ? "Submitted"
          : "Required",
      tone: evidenceComplete ? "complete" : "current",
    });
  }

  if (externalCondition) {
    steps.push({
      label: "Submit external transaction hash",
      status: verifiedOnChain
        ? "Verified on-chain"
        : conditionVerification?.status === "verification_failed"
          ? "Verification failed"
          : conditionVerification?.status === "verification_in_progress"
            ? "Proof requested"
            : "Pending",
      tone: conditionComplete ? "complete" : "current",
    });
  }

  steps.push(
    lifecycle === "blockchain_condition_only"
      ? {
          label: "Authorized verifier settlement",
          status: verifiedOnChain
            ? "Seller credited"
            : "Waiting for authorized verifier",
          tone: verifiedOnChain ? "complete" : "current",
        }
      : {
          label: "Verification and buyer acceptance",
          status: prerequisitesComplete
            ? detail.chain?.state === "Complete"
              ? "Complete"
              : "Awaiting buyer acceptance"
            : "Waiting for prerequisites",
          tone:
            prerequisitesComplete && detail.chain?.state === "Complete"
              ? "complete"
              : prerequisitesComplete
                ? "current"
                : "pending",
        },
    {
      label: "Withdraw only after contract credit",
      status: withdrawable ? "Available" : "Not available",
      tone: withdrawable ? "complete" : "inactive",
    },
  );

  return steps;
}
