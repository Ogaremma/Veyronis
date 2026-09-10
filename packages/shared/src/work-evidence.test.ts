import { AbiCoder, ZeroHash, keccak256 } from "ethers";
import { describe, expect, it } from "vitest";
import {
  agreementDeliverableSchema,
  computeAgreementCommitment,
  computeEvidencePolicyCommitment,
  computeWorkEvidenceCommitment,
  evidenceRequirementSchema,
  workEvidenceSubmissionInputSchema,
  type AgreementDeliverable,
  type AgreementEvidenceRequirement,
  type AgreementDraft,
  type EvidencePolicy,
} from "./index.js";

const buyer = "0x1000000000000000000000000000000000000001";
const seller = "0x2000000000000000000000000000000000000002";
const arbitrator = "0x3000000000000000000000000000000000000003";
const registry = "0x4000000000000000000000000000000000000004";
const policy: EvidencePolicy = {
  version: 1,
  evidenceType: "0x1000000000000000000000000000000000000000000000000000000000000001",
  sourceChainKey: 1,
  assetKind: "native",
  expectedSourceContract: "0x0000000000000000000000000000000000000000",
  expectedRecipient: seller,
  expectedAsset: "0x0000000000000000000000000000000000000000",
  expectedSender: buyer,
  amountRule: "exact",
  amount: "100",
  minSourceBlock: "0",
  maxSourceBlock: "0",
  calldataSelector: "0x00000000",
  requireTransferEvent: false,
};

const requirement: AgreementEvidenceRequirement = {
  id: "11111111-1111-4111-8111-111111111111",
  label: "Live website URL",
  kind: "URL" as const,
  required: true,
  configuration: { expectedDomain: "example.com" },
  position: 0,
};

const optionalRequirement = {
  ...requirement,
  id: "22222222-2222-4222-8222-222222222222",
  label: "Screenshot",
  kind: "PHOTO" as const,
  required: false,
  position: 1,
};

const deliverable = {
  id: "33333333-3333-4333-8333-333333333333",
  title: "Deployed website",
  description: "Build and deploy the production website.",
  required: true,
  active: true,
  position: 0,
  evidenceRequirements: [requirement, optionalRequirement],
} satisfies AgreementDeliverable;

const secondDeliverable = {
  ...deliverable,
  id: "44444444-4444-4444-8444-444444444444",
  title: "Source code",
  position: 1,
  evidenceRequirements: [
    {
      ...requirement,
      id: "55555555-5555-4555-8555-555555555555",
      label: "GitHub repository",
      kind: "GITHUB_REPOSITORY" as const,
    },
  ],
} satisfies AgreementDeliverable;

const draft: AgreementDraft = {
  buyer,
  seller,
  arbitrator,
  evidenceRegistry: registry,
  requiredAmount: "100",
  agreementNonce:
    "0x4000000000000000000000000000000000000000000000000000000000000004",
  policy,
  deliverables: [deliverable],
};

describe("work evidence terms", () => {
  it("validates multiple deliverables and multiple evidence requirements", () => {
    const secondDeliverable = {
      ...deliverable,
      id: "44444444-4444-4444-8444-444444444444",
      title: "Source code",
      position: 1,
      evidenceRequirements: [
        {
          ...requirement,
          id: "55555555-5555-4555-8555-555555555555",
          label: "GitHub repository",
          kind: "GITHUB_REPOSITORY" as const,
        },
        {
          ...requirement,
          id: "66666666-6666-4666-8666-666666666666",
          label: "Git commit SHA",
          kind: "GITHUB_COMMIT" as const,
          position: 1,
        },
      ],
    };

    expect(agreementDeliverableSchema.safeParse(deliverable).success).toBe(true);
    expect(
      agreementDeliverableSchema.safeParse(secondDeliverable).success,
    ).toBe(true);
    expect(evidenceRequirementSchema.safeParse(optionalRequirement).success).toBe(true);
    expect(workEvidenceSubmissionInputSchema.safeParse({
      requirementId: requirement.id,
      value: "https://example.com",
      mimeType: "text/html",
    }).success).toBe(true);
  });

  it("changes the work evidence commitment when terms change", () => {
    const base = computeWorkEvidenceCommitment([deliverable]);
    expect(computeWorkEvidenceCommitment([])).toBe(ZeroHash);
    expect(computeWorkEvidenceCommitment([{ ...deliverable, title: "Updated" }]))
      .not.toBe(base);
    expect(computeWorkEvidenceCommitment([{
      ...deliverable,
      evidenceRequirements: [
        { ...requirement, required: false },
        optionalRequirement,
      ],
    }])).not.toBe(base);
    expect(computeWorkEvidenceCommitment([{
      ...deliverable,
      evidenceRequirements: [
        { ...requirement, kind: "GITHUB_REPOSITORY" as const },
        optionalRequirement,
      ],
    }])).not.toBe(base);
  });

  it("binds work evidence into the agreement commitment while keeping blockchain policy separate", () => {
    const agreementCommitment = computeAgreementCommitment(draft);
    expect(computeAgreementCommitment({ ...draft })).toBe(agreementCommitment);
    expect(computeAgreementCommitment({ ...draft, deliverables: undefined }))
      .toBe(keccak256(AbiCoder.defaultAbiCoder().encode(
        ["address", "address", "address", "uint256", "bytes32", "bytes32", "address"],
        [
          draft.buyer,
          draft.seller,
          draft.arbitrator,
          draft.requiredAmount,
          computeEvidencePolicyCommitment(draft.policy),
          draft.agreementNonce,
          draft.evidenceRegistry,
        ],
      )));
    expect(computeAgreementCommitment({
      ...draft,
      deliverables: [{ ...deliverable, title: "Updated delivery" }],
    })).not.toBe(agreementCommitment);
    expect(computeEvidencePolicyCommitment(draft.policy))
      .not.toBe(computeWorkEvidenceCommitment(draft.deliverables));
  });

  it("changes the agreement commitment for delivery ordering, state, and configuration", () => {
    const base = computeAgreementCommitment({
      ...draft,
      deliverables: [deliverable, secondDeliverable],
    });
    expect(computeAgreementCommitment({
      ...draft,
      deliverables: [
        { ...secondDeliverable, position: 0 },
        { ...deliverable, position: 1 },
      ],
    })).not.toBe(base);
    expect(computeAgreementCommitment({
      ...draft,
      deliverables: [
        { ...deliverable, active: false },
        secondDeliverable,
      ],
    })).not.toBe(base);
    expect(computeAgreementCommitment({
      ...draft,
      deliverables: [
        {
          ...deliverable,
          evidenceRequirements: [
            {
              ...requirement,
              configuration: { expectedDomain: "staging.example.com" },
            },
            optionalRequirement,
          ],
        },
        secondDeliverable,
      ],
    })).not.toBe(base);
  });
});
