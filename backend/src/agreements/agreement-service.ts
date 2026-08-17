import { getAddress, keccak256, toUtf8Bytes } from "ethers";
import {
  computeAgreementCommitment,
  computeEvidencePolicyCommitment,
  validateAgreementDraft,
  type AgreementDraft,
  type AgreementMetadata,
} from "@veyronis/shared";
import type { AgreementRepository } from "./agreement-repository.js";
import type { EscrowDeploymentGateway } from "./escrow-deployer.js";

export interface PreparedAgreement {
  agreement: AgreementMetadata;
  confirmationRequired: true;
}

export class AgreementCreationService {
  constructor(
    private readonly repository: AgreementRepository,
    private readonly deployer: EscrowDeploymentGateway,
  ) {}

  async prepare(input: unknown): Promise<PreparedAgreement> {
    const draft = normalizeDraft(validateAgreementDraft(input));
    const evidencePolicyCommitment = computeEvidencePolicyCommitment(
      draft.policy,
    );
    const agreementCommitment = computeAgreementCommitment(
      draft,
      evidencePolicyCommitment,
    );
    const now = new Date().toISOString();
    const agreement: AgreementMetadata = {
      ...draft,
      id: keccak256(toUtf8Bytes(`veyronis:${agreementCommitment}`)),
      agreementCommitment,
      evidencePolicyCommitment,
      deploymentStatus: "AWAITING_CONFIRMATION",
      createdAt: now,
      updatedAt: now,
    };
    await this.repository.createAgreement(agreement);
    return { agreement, confirmationRequired: true };
  }

  async confirmAndDeploy(id: string): Promise<AgreementMetadata> {
    const agreement = await this.repository.getAgreementById(id);
    if (!agreement) throw new Error("Agreement metadata not found");
    if (agreement.deploymentStatus !== "AWAITING_CONFIRMATION")
      throw new Error("Agreement is not awaiting confirmation");
    await this.repository.updateDeploymentStatus(id, { status: "DEPLOYING" });
    try {
      const result = await this.deployer.deploy({ ...agreement });
      await this.repository.updateDeploymentStatus(id, {
        status: "DEPLOYED",
        escrowAddress: result.escrowAddress,
        transactionHash: result.transactionHash,
        ...(result.blockNumber ? { blockNumber: result.blockNumber } : {}),
      });
    } catch {
      await this.repository.updateDeploymentStatus(id, {
        status: "FAILED",
        error: "Escrow deployment failed",
      });
    }
    const updated = await this.repository.getAgreementById(id);
    if (!updated)
      throw new Error("Agreement metadata disappeared after deployment");
    return updated;
  }
}

function normalizeDraft(draft: AgreementDraft): AgreementDraft {
  return {
    ...draft,
    buyer: getAddress(draft.buyer),
    seller: getAddress(draft.seller),
    arbitrator: getAddress(draft.arbitrator),
    evidenceRegistry: getAddress(draft.evidenceRegistry),
    policy: {
      ...draft.policy,
      expectedSourceContract: getAddress(draft.policy.expectedSourceContract),
      expectedRecipient: getAddress(draft.policy.expectedRecipient),
      expectedAsset: getAddress(draft.policy.expectedAsset),
      expectedSender: getAddress(draft.policy.expectedSender),
      evidenceType: draft.policy.evidenceType.toLowerCase(),
      calldataSelector: draft.policy.calldataSelector.toLowerCase(),
    },
  };
}
