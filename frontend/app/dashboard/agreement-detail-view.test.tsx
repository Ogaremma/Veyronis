import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ZeroAddress, ZeroHash, id } from "ethers";
import type { AgreementDetails, EscrowState, ParticipantRole } from "@veyronis/shared";
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
    for (const state of ["AwaitingPayment", "AwaitingDelivery", "Disputed"] as const) {
      const html = renderDetail(detailFor("seller", state));
      expect(html).not.toContain("Withdraw 1.0 ETH");
      expect(html).not.toContain("ETH available");
    }
  });

  it("shows seller withdrawal only when Complete with a positive balance", () => {
    expect(renderDetail(detailFor("seller", "Complete"))).toContain("Withdraw 1.0 ETH");
    expect(renderDetail(detailFor("seller", "Complete", "0"))).not.toContain("Withdraw 1.0 ETH");
  });

  it("does not give buyer or arbitrator the seller withdrawal control", () => {
    expect(renderDetail(detailFor("buyer", "Complete"))).not.toContain(">Withdraw");
    expect(renderDetail(detailFor("arbitrator", "Complete"))).not.toContain(">Withdraw");
    expect(renderDetail(detailFor("buyer", "Refunded"))).toContain("Withdraw 1.0 ETH");
  });
});

describe("agreement guidance", () => {
  it("orders seller work and keeps proof advisory", () => {
    const html = renderDetail(detailFor("seller", "AwaitingDelivery"));
    const flowStart = html.indexOf("Review agreement terms");
    const evidence = html.indexOf("Complete required delivery evidence");
    const condition = html.indexOf("Complete external blockchain condition");
    const review = html.indexOf("Wait for verification and review");
    const settlement = html.indexOf("Wait for buyer acceptance or arbitrator resolution");
    expect([flowStart, evidence, condition, review, settlement]).toEqual(
      [...[flowStart, evidence, condition, review, settlement]].sort((left, right) => left - right),
    );
    expect(html).toContain("Proof verification is advisory input");
    expect(html).toContain("does not automatically release funds");
  });
});
