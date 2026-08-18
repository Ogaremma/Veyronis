import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ZeroHash, id } from "ethers";
import type { AgreementDetails } from "@veyronis/shared";
import { AgreementDetailView } from "./agreement-detail-view";

const detail = { role: "seller", metadata: { requiredAmount: "100" }, actions: ["approveRefund", "openDispute", "withdraw"], reconciliation: { status: "METADATA_STALE", authoritativeSource: "BLOCKCHAIN", mismatches: ["required amount"], checkedAtBlock: "10" }, timeline: [{ name: "VerifiedClaimAccepted", transactionHash: id("tx"), blockNumber: "10", logIndex: 0, advisory: true }], chain: {
  escrowAddress: "0x4000000000000000000000000000000000000004", buyer: "0x1000000000000000000000000000000000000001", seller: "0x2000000000000000000000000000000000000002", arbitrator: "0x3000000000000000000000000000000000000003",
  requiredAmount: "100", agreementCommitment: id("agreement"), evidencePolicyCommitment: id("policy"), state: "RefundRequested", depositedAmount: "100", activeEvidenceCommitment: id("evidence"), verifiedClaimId: ZeroHash, withdrawalAmount: "25", blockNumber: "10",
} } as unknown as AgreementDetails;

describe("agreement operational view", () => {
  it("renders role actions, lifecycle, reconciliation, evidence, and withdrawal state", () => {
    const html = renderToStaticMarkup(<AgreementDetailView detail={detail} transaction={{ status: "CONFIRMING", hash: id("pending") }} execute={() => {}} />);
    expect(html).toContain("Approve refund");
    expect(html).toContain("Open dispute");
    expect(html).not.toContain("Confirm delivery");
    expect(html).toContain("Refund requested");
    expect(html).toContain("Blockchain state is authoritative");
    expect(html).toContain("ADVISORY EVIDENCE");
    expect(html).toContain("ETH available");
    expect(html).toContain("CONFIRMING");
  });
});
