import { ZeroAddress, id } from "ethers";
import { describe, expect, it, vi } from "vitest";
import type { AgreementMetadata } from "@veyronis/shared";
import { InMemoryAgreementRepository } from "./agreement-repository.js";
import { WorkEvidenceService, WorkEvidenceServiceError } from "./work-evidence-service.js";
import { InMemoryWorkEvidenceRepository } from "./work-evidence-repository.js";

const buyer = "0x1000000000000000000000000000000000000001";
const seller = "0x2000000000000000000000000000000000000002";
const arbitrator = "0x3000000000000000000000000000000000000003";
const requiredRequirementId = "22222222-2222-4222-8222-222222222222";
const optionalRequirementId = "33333333-3333-4333-8333-333333333333";
const agreementId = id("agreement");

const agreement: AgreementMetadata = {
  id: agreementId,
  buyer,
  seller,
  arbitrator,
  evidenceRegistry: "0x4000000000000000000000000000000000000004",
  requiredAmount: "100",
  agreementNonce: id("nonce"),
  agreementCommitment: id("agreement"),
  evidencePolicyCommitment: id("policy"),
  deploymentStatus: "DEPLOYED",
  escrowAddress: "0x5000000000000000000000000000000000000005",
  createdAt: new Date(0).toISOString(),
  updatedAt: new Date(0).toISOString(),
  policy: {
    version: 1,
    evidenceType: id("SOURCE_PAYMENT"),
    sourceChainKey: 1,
    assetKind: "native",
    expectedSourceContract: ZeroAddress,
    expectedRecipient: seller,
    expectedAsset: ZeroAddress,
    expectedSender: buyer,
    amountRule: "exact",
    amount: "100",
    minSourceBlock: "0",
    maxSourceBlock: "0",
    calldataSelector: "0x00000000",
    requireTransferEvent: false,
  },
  deliverables: [
    {
      id: "11111111-1111-4111-8111-111111111111",
      title: "Deployed website",
      description: "Build and deploy the website.",
      required: true,
      active: true,
      position: 0,
      evidenceRequirements: [
        {
          id: requiredRequirementId,
          label: "Live website URL",
          kind: "URL",
          required: true,
          configuration: {},
          position: 0,
        },
        {
          id: optionalRequirementId,
          label: "Screenshot",
          kind: "PHOTO",
          required: false,
          configuration: {},
          position: 1,
        },
      ],
    },
  ],
};

async function setup() {
  const agreements = new InMemoryAgreementRepository();
  await agreements.createAgreement(agreement);
  const submissions = new InMemoryWorkEvidenceRepository();
  return {
    agreements,
    submissions,
    service: new WorkEvidenceService(agreements, submissions),
  };
}

function rejection(reason: unknown): WorkEvidenceServiceError {
  expect(reason).toBeInstanceOf(WorkEvidenceServiceError);
  return reason as WorkEvidenceServiceError;
}

describe("work evidence service", () => {
  it("lets only the seller submit required or optional evidence", async () => {
    const { service } = await setup();
    const required = await service.submit(agreementId, seller, {
      requirementId: requiredRequirementId,
      value: "https://example.com",
    });
    const optional = await service.submit(agreementId, seller, {
      requirementId: optionalRequirementId,
      value: "https://example.com/screenshot.png",
      contentHash: "sha256:test",
      mimeType: "image/png",
      byteSize: "1024",
    });

    expect(required.status).toBe("submitted");
    expect(required.requirementId).toBe(requiredRequirementId);
    expect(optional.status).toBe("submitted");
    expect(optional.mimeType).toBe("image/png");

    await expect(service.submit(agreementId, buyer, {
      requirementId: requiredRequirementId,
      value: "https://buyer.example",
    })).rejects.toSatisfy((reason: unknown) => rejection(reason).status === 403);
    await expect(service.submit(agreementId, "0x9000000000000000000000000000000000000009", {
      requirementId: requiredRequirementId,
      value: "https://unrelated.example",
    })).rejects.toSatisfy((reason: unknown) => rejection(reason).status === 403);
  });

  it("lets buyer and arbitrator view submissions but rejects unrelated wallets", async () => {
    const { service } = await setup();
    const submission = await service.submit(agreementId, seller, {
      requirementId: requiredRequirementId,
      value: "https://example.com",
    });

    await expect(service.list(agreementId, buyer)).resolves.toEqual([submission]);
    await expect(service.list(agreementId, arbitrator)).resolves.toEqual([submission]);
    await expect(service.list(agreementId, seller)).resolves.toEqual([submission]);
    await expect(service.list(agreementId, "0x9000000000000000000000000000000000000009"))
      .rejects.toSatisfy((reason: unknown) => rejection(reason).status === 403);
  });

  it("lets buyer and arbitrator accept or reject submissions without settling escrow", async () => {
    const { agreements, service } = await setup();
    const updateDeploymentStatus = vi.spyOn(agreements, "updateDeploymentStatus");
    const recordReconciliation = vi.spyOn(agreements, "recordReconciliation");
    const accepted = await service.submit(agreementId, seller, {
      requirementId: requiredRequirementId,
      value: "https://example.com",
    });
    const rejected = await service.submit(agreementId, seller, {
      requirementId: optionalRequirementId,
      value: "https://example.com/screenshot.png",
    });

    await expect(service.review(agreementId, accepted.id, buyer, {
      status: "accepted",
    })).resolves.toMatchObject({ status: "accepted" });
    await expect(service.review(agreementId, rejected.id, arbitrator, {
      status: "rejected",
      reviewNote: "Screenshot does not show the deployed site.",
    })).resolves.toMatchObject({
      status: "rejected",
      reviewNote: "Screenshot does not show the deployed site.",
    });
    await expect(service.review(agreementId, accepted.id, seller, {
      status: "rejected",
    })).rejects.toSatisfy((reason: unknown) => rejection(reason).status === 403);

    const metadata = await agreements.getAgreementById(agreementId);
    expect(metadata?.deploymentStatus).toBe("DEPLOYED");
    expect(metadata?.deliverables).toEqual(agreement.deliverables);
    expect(updateDeploymentStatus).not.toHaveBeenCalled();
    expect(recordReconciliation).not.toHaveBeenCalled();
  });
});
