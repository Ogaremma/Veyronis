import { canWithdrawEscrowFunds, externalBlockchainConditionFromPolicy } from "@veyronis/shared";
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
  const requirements = (detail.metadata.deliverables ?? [])
    .filter(deliverable => deliverable.active)
    .flatMap(deliverable => deliverable.evidenceRequirements);
  const requiredRequirementIds = new Set(
    requirements.filter(requirement => requirement.required).map(requirement => requirement.id),
  );
  const acceptedRequirementIds = new Set(
    workEvidenceSubmissions
      .filter(submission => submission.status === "accepted")
      .map(submission => submission.requirementId),
  );
  const evidenceComplete = requirements.length === 0 || [...requiredRequirementIds].every(id => acceptedRequirementIds.has(id));
  const evidenceSubmitted = workEvidenceSubmissions.some(submission => submission.status !== "rejected");
  const externalCondition = externalBlockchainConditionFromPolicy(detail.metadata.policy);
  const conditionComplete = !externalCondition || conditionVerification?.status === "verified";
  const prerequisitesComplete = evidenceComplete && conditionComplete;
  const withdrawable = detail.chain
    ? canWithdrawEscrowFunds(detail.role, detail.chain.state, detail.chain.withdrawalAmount)
    : false;

  return [
    { label: "Review agreement terms", status: "Complete", tone: "complete" },
    {
      label: "Complete required delivery evidence",
      status: requirements.length === 0
        ? "Not required"
        : evidenceComplete
          ? "Complete"
          : evidenceSubmitted
            ? "Submitted"
            : "Required",
      tone: requirements.length === 0 || evidenceComplete ? "complete" : "current",
    },
    {
      label: "Complete external blockchain condition",
      status: !externalCondition
        ? "Not configured"
        : conditionVerification?.status === "verified"
          ? "Verified"
          : conditionVerification?.status === "verification_failed"
            ? "Verification failed"
            : "Pending",
      tone: conditionComplete ? "complete" : "current",
    },
    {
      label: "Wait for verification and review",
      status: prerequisitesComplete ? "Current" : "Waiting for prerequisites",
      tone: prerequisitesComplete ? "current" : "pending",
    },
    {
      label: "Wait for buyer acceptance or arbitrator resolution",
      status: detail.chain?.state === "AwaitingDelivery" || detail.chain?.state === "Disputed"
        ? "Current"
        : "Not current",
      tone: detail.chain?.state === "AwaitingDelivery" || detail.chain?.state === "Disputed"
        ? "current"
        : "pending",
    },
    {
      label: "Withdraw only after valid settlement",
      status: withdrawable ? "Available" : "Not available",
      tone: withdrawable ? "complete" : "inactive",
    },
  ];
}
