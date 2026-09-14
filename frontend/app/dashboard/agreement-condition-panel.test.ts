import { describe, expect, it } from "vitest";
import type {
  AgreementConditionVerification,
  AgreementDetails,
} from "@veyronis/shared";
import {
  canSubmitCondition,
  conditionSummarySteps,
  externalPaymentStatus,
  conditionStatusLabel,
  failureLabel,
  isVerifiedOnChain,
  verificationProviderLabel,
} from "./agreement-condition-panel";

function verification(status: AgreementConditionVerification["status"]) {
  return {
    id: "11111111-1111-4111-8111-111111111111",
    agreementId: "0x" + "1".repeat(64),
    submitter: "0x2000000000000000000000000000000000000002",
    transactionHash: "0x" + "2".repeat(64),
    status,
    submittedAt: new Date(0).toISOString(),
    updatedAt: new Date(0).toISOString(),
  };
}

describe("agreement condition panel", () => {
  it("displays pending, in-progress, verified, retryable, and failed statuses", () => {
    expect(conditionStatusLabel(undefined)).toBe("Pending");
    expect(conditionStatusLabel(verification("pending"))).toBe("Pending");
    expect(
      conditionStatusLabel(verification("verification_in_progress"), true),
    ).toBe("Verification in progress");
    expect(conditionStatusLabel(verification("verified"))).toBe(
      "Authorized claim pending contract acceptance",
    );
    expect(conditionStatusLabel(verification("verified"), false, true)).toBe(
      "Verified on-chain",
    );
    expect(
      conditionStatusLabel({
        ...verification("verification_failed"),
        failureCode: "PROOF_UNAVAILABLE",
      }),
    ).toBe("Proof unavailable");
    expect(conditionStatusLabel(verification("verification_failed"))).toBe(
      "Verification failed",
    );
  });

  it("lets only the seller submit until the condition is verified", () => {
    expect(canSubmitCondition("seller", undefined)).toBe(true);
    expect(canSubmitCondition("buyer", undefined)).toBe(false);
    expect(canSubmitCondition("arbitrator", undefined)).toBe(false);
    expect(
      canSubmitCondition("seller", verification("verification_failed")),
    ).toBe(true);
    expect(canSubmitCondition("seller", verification("verified"))).toBe(false);
  });

  it("maps technical failures to safe user-facing messages", () => {
    expect(failureLabel("PROOF_UNAVAILABLE")).toContain("Wait for attestation");
    expect(failureLabel("SUBJECT_MISMATCH")).toContain("sender");
    expect(failureLabel("WRONG_RECIPIENT")).toContain("recipient");
    expect(failureLabel("WRONG_ASSET")).toContain("token");
    expect(failureLabel("WRONG_AMOUNT")).toContain("amount");
    expect(failureLabel("WRONG_EVENT")).toContain("did not succeed");
    expect(failureLabel(undefined)).not.toContain("0x");
  });

  it("requires an authoritative matching on-chain claim before verified state", () => {
    const detail = {
      chain: { state: "Complete", verifiedClaimId: "0x" + "3".repeat(64) },
    };
    const verified = {
      ...verification("verified"),
      verifiedClaimId: "0x" + "3".repeat(64),
    };
    expect(isVerifiedOnChain(detail as never, verified)).toBe(true);
    expect(
      isVerifiedOnChain(
        {
          chain: { state: "Complete", verifiedClaimId: "0x" + "4".repeat(64) },
        } as never,
        verified,
      ),
    ).toBe(false);
    expect(
      isVerifiedOnChain(
        {
          chain: {
            state: "AwaitingDelivery",
            verifiedClaimId: "0x" + "3".repeat(64),
          },
        } as never,
        verified,
      ),
    ).toBe(true);
  });

  it("does not unlock payment for a submitted hash, pending proof, or failed proof", () => {
    const detail = blockchainOnlyDetail(
      "AwaitingDelivery",
      "0x" + "0".repeat(64),
      "0",
    );
    expect(externalPaymentStatus(detail, undefined).label).toBe(
      "Locked — awaiting transaction hash",
    );
    expect(
      externalPaymentStatus(detail, verification("verification_in_progress"))
        .label,
    ).toBe("Locked — verification pending");
    expect(
      externalPaymentStatus(detail, {
        ...verification("verification_failed"),
        failureCode: "PROOF_UNAVAILABLE",
      }).label,
    ).toBe("Locked — proof unavailable");
    expect(conditionSummarySteps(detail, undefined)[3]).toMatchObject({
      label: "Payment unlocked",
      status: "Pending",
    });
  });

  it("does not show withdrawal for valid proof without an accepted on-chain claim", () => {
    const detail = blockchainOnlyDetail(
      "AwaitingDelivery",
      "0x" + "4".repeat(64),
      "0",
    );
    const verified = {
      ...verification("verified"),
      verifiedClaimId: "0x" + "3".repeat(64),
    };

    expect(externalPaymentStatus(detail, verified).label).toBe(
      "Locked — claim not accepted",
    );
  });

  it("shows withdrawal only from authoritative complete state and positive balance", () => {
    const claimId = "0x" + "3".repeat(64);
    const verified = { ...verification("verified"), verifiedClaimId: claimId };
    const available = blockchainOnlyDetail("Complete", claimId, "100");
    const withdrawn = {
      ...available,
      timeline: [{ name: "Withdrawn" }],
    };

    expect(externalPaymentStatus(available, verified).label).toBe(
      "Unlocked — withdrawal available",
    );
    expect(
      externalPaymentStatus(
        blockchainOnlyDetail("Complete", claimId, "0"),
        verified,
      ).label,
    ).toBe("Unlocked");
    expect(externalPaymentStatus(withdrawn as never, verified).label).toBe(
      "Withdrawn",
    );
  });

  it("renders the five professional condition progression states", () => {
    const detail = blockchainOnlyDetail(
      "AwaitingDelivery",
      "0x" + "0".repeat(64),
      "0",
    );
    const stages = conditionSummarySteps(
      detail,
      verification("verification_in_progress"),
    );

    expect(stages).toHaveLength(5);
    expect(
      stages.filter((stage) => stage.label === "Transaction hash submitted"),
    ).toHaveLength(1);
    expect(stages.map((stage) => stage.label)).toEqual([
      "Transaction hash submitted",
      "Proof requested",
      "Verified on-chain",
      "Payment unlocked",
      "Seller withdrawal available",
    ]);
  });

  it("reflects only providers that actually participated", () => {
    expect(
      verificationProviderLabel(
        {
          condition: {} as never,
          verificationProviders: ["Attestcoin", "Creditcoin"],
        },
        true,
      ),
    ).toBe("Verified by Attestcoin Protocol on Creditcoin");
    expect(
      verificationProviderLabel(
        {
          condition: {} as never,
          verificationProviders: ["Attestcoin"],
        },
        true,
      ),
    ).toBe("Verified by Attestcoin Protocol on Creditcoin");
  });
});

function blockchainOnlyDetail(
  state: "AwaitingDelivery" | "Complete",
  verifiedClaimId: string,
  withdrawalAmount: string,
): AgreementDetails {
  return {
    role: "seller",
    metadata: {
      agreementMode: "blockchain_condition_only",
      policy: {},
      deliverables: [],
    },
    chain: { state, verifiedClaimId, withdrawalAmount },
    timeline: [],
  } as unknown as AgreementDetails;
}
