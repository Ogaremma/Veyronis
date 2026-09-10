import { renderToStaticMarkup } from "react-dom/server";
import React from "react";
import { describe, expect, it, vi } from "vitest";
import type { AgreementDeliverable } from "@veyronis/shared";
import {
  DeliverablesEditor,
  EvidenceRequirementsEditor,
} from "./agreement-terms-editor";

const deliverable: AgreementDeliverable = {
  id: "11111111-1111-4111-8111-111111111111",
  title: "Product shipment",
  description: "10 custom T-shirts delivered to buyer.",
  required: true,
  active: true,
  position: 0,
  evidenceRequirements: [
    {
      id: "22222222-2222-4222-8222-222222222222",
      label: "Product photos",
      kind: "PHOTO",
      required: true,
      configuration: {},
      position: 0,
    },
    {
      id: "33333333-3333-4333-8333-333333333333",
      label: "Tracking URL",
      kind: "TRACKING_URL",
      required: false,
      configuration: {},
      position: 1,
    },
  ],
};

describe("agreement terms editors", () => {
  it("renders buyer-facing deliverables separately from blockchain verification", () => {
    const html = renderToStaticMarkup(
      <DeliverablesEditor deliverables={[deliverable]} onChange={vi.fn()} />,
    );
    expect(html).toContain("What must the seller deliver?");
    expect(html).toContain("Product shipment");
    expect(html).toContain("Required deliverable");
    expect(html).not.toContain("Attestcoin");
    expect(html).not.toContain("Creditcoin");
  });

  it("renders multiple required and optional evidence requirements per deliverable", () => {
    const html = renderToStaticMarkup(
      <EvidenceRequirementsEditor
        deliverables={[deliverable]}
        onChange={vi.fn()}
      />,
    );
    expect(html).toContain("What proof must the seller provide?");
    expect(html).toContain("Product photos");
    expect(html).toContain("Tracking URL");
    expect(html).toContain("PHOTO");
    expect(html).toContain("TRACKING URL");
    expect(html).not.toContain("source-chain block");
  });
});
