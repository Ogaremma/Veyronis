import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ZeroAddress, ZeroHash, id } from "ethers";
import type {
  AgreementDetails,
  EscrowState,
  ParticipantRole,
} from "@veyronis/shared";
import { AgreementDetailView } from "./agreement-detail-view";

function detailFor(
  role: ParticipantRole,
  state: EscrowState,
  withdrawalAmount = "1000000000000000000",
): AgreementDetails {
  return {
    role,
    metadata: {
      requiredAmount: "100",
      policy: {
        version: 1,
        evidenceType: id("BLOCKCHAIN_VERIFICATION_DISABLED"),
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
      deliverables: [
        {
          id: "11111111-1111-4111-8111-111111111111",
          title: "Delivery",
          description: "",
          required: true,
          active: true,
          position: 0,
          evidenceRequirements: [
            {
              id: "22222222-2222-4222-8222-222222222222",
              label: "Delivery receipt",
              kind: "RECEIPT",
              required: true,
              configuration: {},
              position: 0,
            },
          ],
        },
      ],
    },
    actions: ["withdraw"],
    timeline: [],
    chain: {
      escrowAddress: "0x4000000000000000000000000000000000000004",
      buyer: "0x1000000000000000000000000000000000000001",
      seller: "0x2000000000000000000000000000000000000002",
      arbitrator: "0x3000000000000000000000000000000000000003",
      requiredAmount: "100",
      agreementCommitment: id("agreement"),
      evidencePolicyCommitment: id("policy"),
      state,
      depositedAmount: "100",
      activeEvidenceCommitment: id("evidence"),
      verifiedClaimId: ZeroHash,
      withdrawalAmount,
      blockNumber: "10",
    },
  } as unknown as AgreementDetails;
}

function renderDetail(detail: AgreementDetails) {
  return renderToStaticMarkup(
    <AgreementDetailView
      detail={detail}
      transaction={{ status: "IDLE" }}
      execute={() => {}}
    />,
  );
}

describe("agreement withdrawal gating", () => {
  it("does not show seller withdrawal before terminal settlement", () => {
    for (const state of [
      "AwaitingPayment",
      "AwaitingDelivery",
      "Disputed",
    ] as const) {
      const html = renderDetail(detailFor("seller", state));
      expect(html).not.toContain("Withdraw 1.0 ETH");
      expect(html).not.toContain("ETH available");
    }
  });

  it("shows seller withdrawal only when Complete with a positive balance", () => {
    expect(renderDetail(detailFor("seller", "Complete"))).toContain(
      "Withdraw 1.0 ETH",
    );
    expect(renderDetail(detailFor("seller", "Complete", "0"))).not.toContain(
      "Withdraw 1.0 ETH",
    );
  });

  it("does not give buyer or arbitrator the seller withdrawal control", () => {
    expect(renderDetail(detailFor("buyer", "Complete"))).not.toContain(
      "Withdraw 1.0 ETH",
    );
    expect(renderDetail(detailFor("arbitrator", "Complete"))).not.toContain(
      "Withdraw 1.0 ETH",
    );
    expect(renderDetail(detailFor("buyer", "Refunded"))).toContain(
      "Withdraw 1.0 ETH",
    );
  });
});

describe("agreement guidance", () => {
  it("orders seller work and keeps proof advisory", () => {
    const html = renderDetail(detailFor("seller", "AwaitingDelivery"));
    const flowStart = html.indexOf("Review agreement terms");
    const evidence = html.indexOf("Submit application work evidence");
    const condition = html.indexOf("Submit external transaction hash");
    const review = html.indexOf("Verification and buyer acceptance");
    const settlement = html.indexOf("Withdraw only after contract credit");
    expect(flowStart).toBeGreaterThanOrEqual(0);
    expect(evidence).toBeGreaterThan(flowStart);
    expect(condition).toBe(-1);
    expect(review).toBeGreaterThan(evidence);
    expect(settlement).toBeGreaterThan(review);
    expect(html).toContain("configured requirements");
    expect(html).toContain("only after the escrow contract credits the seller");
  });

  it("hides all human settlement controls for blockchain-only agreements", () => {
    const detail = detailFor("buyer", "AwaitingDelivery", "0");
    detail.metadata.policy.evidenceType = id("SOURCE_PAYMENT");
    detail.metadata.deliverables = [];
    detail.actions = [
      "confirmDelivery",
      "requestRefund",
      "approveRefund",
      "openDispute",
      "resolveRelease",
      "resolveRefund",
    ];

    const html = renderDetail(detail);

    expect(html).not.toContain("Confirm delivery");
    expect(html).not.toContain("Request refund");
    expect(html).not.toContain("Approve refund");
    expect(html).not.toContain("Open dispute");
    expect(html).not.toContain("Resolve for seller");
    expect(html).not.toContain("Resolve for buyer");
  });

  it("keeps buyer acceptance and refund actions for work-only agreements", () => {
    const detail = detailFor("buyer", "AwaitingDelivery", "0");
    detail.actions = ["confirmDelivery", "requestRefund", "openDispute"];

    const html = renderDetail(detail);

    expect(html).toContain("Confirm delivery");
    expect(html).toContain("Request refund");
    expect(html).toContain("Open dispute");
    expect(html).toContain("Submit application work evidence");
  });

  it("displays separate blockchain and human-review tracks for hybrid agreements", () => {
    const detail = detailFor("seller", "AwaitingDelivery", "0");
    detail.metadata.agreementMode = "hybrid";
    detail.metadata.policy.evidenceType = id("SOURCE_PAYMENT");

    const html = renderDetail(detail);

    expect(html).toContain("Blockchain verification");
    expect(html).toContain("Human review");
    expect(html).toContain(
      "Attestcoin/Creditcoin satisfies only the external condition",
    );
    expect(html).toContain("does not replace buyer acceptance");
  });
});
