import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ZeroAddress, id } from "ethers";
import type { AgreementDetails } from "@veyronis/shared";
import { AgreementConditionPanel, hasExternalBlockchainCondition } from "./agreement-condition-panel";
import { WorkEvidencePanel, hasWorkEvidenceRequirements } from "./work-evidence-panel";

const requirement = {
  id: "22222222-2222-4222-8222-222222222222",
  label: "Tracking URL",
  kind: "TRACKING_URL",
  required: true,
  configuration: {},
  position: 0,
};

function detailFor(options: { deliverables?: typeof requirement[]; externalCondition?: boolean }) {
  return {
    role: "seller",
    metadata: {
      id: "0x" + "1".repeat(64),
      policy: {
        version: 1,
        evidenceType: options.externalCondition === false
          ? id("BLOCKCHAIN_VERIFICATION_DISABLED")
          : id("SOURCE_PAYMENT"),
        sourceChainKey: 1,
        assetKind: "native",
        expectedSourceContract: ZeroAddress,
        expectedRecipient: "0x2000000000000000000000000000000000000002",
        expectedAsset: ZeroAddress,
        expectedSender: "0x1000000000000000000000000000000000000001",
        amountRule: "exact",
        amount: "100",
        minSourceBlock: "0",
        maxSourceBlock: "0",
        calldataSelector: "0x00000000",
        requireTransferEvent: false,
      },
      deliverables: options.deliverables?.length
        ? [{
          id: "11111111-1111-4111-8111-111111111111",
          title: "Delivery",
          description: "",
          required: true,
          active: true,
          position: 0,
          evidenceRequirements: options.deliverables,
        }]
        : [],
    },
    chain: { state: "AwaitingDelivery" },
  } as unknown as AgreementDetails;
}

describe("conditional agreement panels", () => {
  it("hides work evidence when no requirements exist", () => {
    const detail = detailFor({ externalCondition: false });
    expect(hasWorkEvidenceRequirements(detail)).toBe(false);
    expect(renderToStaticMarkup(<WorkEvidencePanel detail={detail} baseUrl="" />)).toBe("");
  });

  it("shows only the required work-evidence input when requirements exist", () => {
    const detail = detailFor({ deliverables: [requirement], externalCondition: false });
    const html = renderToStaticMarkup(<WorkEvidencePanel detail={detail} baseUrl="" />);
    expect(hasWorkEvidenceRequirements(detail)).toBe(true);
    expect(html).toContain("Submit work evidence");
    expect(html).toContain("Evidence URL");
    expect(html).not.toContain("Content hash");
    expect(html).not.toContain("MIME type");
    expect(html).not.toContain("Byte size");
  });

  it("shows the external condition only when configured", () => {
    const absent = detailFor({ externalCondition: false });
    const configured = detailFor({ externalCondition: true });
    expect(hasExternalBlockchainCondition(absent)).toBe(false);
    expect(hasExternalBlockchainCondition(configured)).toBe(true);
    expect(renderToStaticMarkup(<AgreementConditionPanel detail={absent} baseUrl="" />)).toBe("");
    expect(renderToStaticMarkup(<AgreementConditionPanel detail={configured} baseUrl="" />)).toContain("EXTERNAL BLOCKCHAIN CONDITION");
  });

  it("keeps external verification advisory and separate from escrow funding", () => {
    const html = renderToStaticMarkup(
      <AgreementConditionPanel detail={detailFor({ externalCondition: true })} baseUrl="" />,
    );
    expect(html).toContain("separate from the escrow funding transaction");
    expect(html).toContain("does not automatically release escrow funds");
  });
});
