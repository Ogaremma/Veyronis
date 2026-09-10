import { randomUUID } from "node:crypto";
import { getAddress } from "ethers";
import {
  workEvidenceReviewSchema,
  workEvidenceSubmissionInputSchema,
  type AgreementEvidenceRequirement,
  type AgreementMetadata,
  type ParticipantRole,
  type WorkEvidenceSubmission,
} from "@veyronis/shared";
import type { AgreementRepository } from "./agreement-repository.js";
import type { WorkEvidenceRepository } from "./work-evidence-repository.js";

export class WorkEvidenceServiceError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

export class WorkEvidenceService {
  constructor(
    private readonly agreements: AgreementRepository,
    private readonly submissions: WorkEvidenceRepository,
  ) {}

  async submit(
    agreementId: string,
    wallet: string,
    input: unknown,
  ): Promise<WorkEvidenceSubmission> {
    const agreement = await this.requireAgreement(agreementId);
    if (getAddress(wallet) !== getAddress(agreement.seller))
      throw new WorkEvidenceServiceError(
        403,
        "Only the agreement seller can submit work evidence.",
      );
    const parsed = workEvidenceSubmissionInputSchema.parse(input);
    const requirement = findRequirement(agreement, parsed.requirementId);
    if (!requirement || !requirement.deliverableActive)
      throw new WorkEvidenceServiceError(
        404,
        "Evidence requirement was not found for this agreement.",
      );
    const now = new Date().toISOString();
    return this.submissions.createSubmission({
      id: randomUUID(),
      agreementId,
      submitter: getAddress(wallet),
      ...parsed,
      status: "submitted",
      submittedAt: now,
      updatedAt: now,
    });
  }

  async list(
    agreementId: string,
    wallet: string,
  ): Promise<WorkEvidenceSubmission[]> {
    const agreement = await this.requireAgreement(agreementId);
    const role = roleFor(agreement, wallet);
    if (!role)
      throw new WorkEvidenceServiceError(
        403,
        "Wallet is not an agreement participant.",
      );
    return this.submissions.listSubmissions(agreementId);
  }

  async review(
    agreementId: string,
    submissionId: string,
    wallet: string,
    input: unknown,
  ): Promise<WorkEvidenceSubmission> {
    const agreement = await this.requireAgreement(agreementId);
    const role = roleFor(agreement, wallet);
    if (role !== "buyer" && role !== "arbitrator")
      throw new WorkEvidenceServiceError(
        403,
        "Only the buyer or arbitrator can review work evidence.",
      );
    const submission = await this.submissions.getSubmission(submissionId);
    if (!submission || submission.agreementId !== agreementId)
      throw new WorkEvidenceServiceError(
        404,
        "Evidence submission was not found for this agreement.",
      );
    if (submission.status !== "submitted")
      throw new WorkEvidenceServiceError(
        409,
        "Evidence submission has already been reviewed.",
      );
    const parsed = workEvidenceReviewSchema.parse(input);
    const now = new Date().toISOString();
    const reviewed = await this.submissions.reviewSubmission(submissionId, {
      ...parsed,
      reviewedAt: now,
      updatedAt: now,
    });
    if (!reviewed)
      throw new WorkEvidenceServiceError(
        409,
        "Evidence submission has already been reviewed.",
      );
    return reviewed;
  }

  private async requireAgreement(
    agreementId: string,
  ): Promise<AgreementMetadata> {
    const agreement = await this.agreements.getAgreementById(agreementId);
    if (!agreement)
      throw new WorkEvidenceServiceError(404, "Agreement not found.");
    if (agreement.deploymentStatus !== "DEPLOYED")
      throw new WorkEvidenceServiceError(
        409,
        "Work evidence requires a deployed agreement.",
      );
    return agreement;
  }
}

function findRequirement(
  agreement: AgreementMetadata,
  requirementId: string,
): (AgreementEvidenceRequirement & { deliverableActive: boolean }) | undefined {
  for (const deliverable of agreement.deliverables ?? []) {
    const requirement = deliverable.evidenceRequirements.find(
      (candidate) => candidate.id === requirementId,
    );
    if (requirement)
      return { ...requirement, deliverableActive: deliverable.active };
  }
  return undefined;
}

function roleFor(
  agreement: AgreementMetadata,
  wallet: string,
): ParticipantRole | undefined {
  const address = getAddress(wallet);
  if (getAddress(agreement.buyer) === address) return "buyer";
  if (getAddress(agreement.seller) === address) return "seller";
  if (getAddress(agreement.arbitrator) === address) return "arbitrator";
  return undefined;
}
