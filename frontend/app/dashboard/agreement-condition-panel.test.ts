import { describe, expect, it } from "vitest";
import type { AgreementConditionVerification } from "@veyronis/shared";
import {
  canSubmitCondition,
  conditionStatusLabel,
  failureLabel,
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
  it("displays pending, in-progress, verified, and failed statuses", () => {
    expect(conditionStatusLabel(undefined)).toBe("Pending");
    expect(conditionStatusLabel(verification("pending"))).toBe("Pending");
    expect(
      conditionStatusLabel(verification("verification_in_progress"), true),
    ).toBe("Verification in progress");
    expect(conditionStatusLabel(verification("verified"))).toBe("Verified");
    expect(conditionStatusLabel(verification("verification_failed"))).toBe(
      "Verification failed",
    );
  });

  it("lets only the seller submit until the condition is verified", () => {
    expect(canSubmitCondition("seller", undefined)).toBe(true);
    expect(canSubmitCondition("buyer", undefined)).toBe(false);
    expect(canSubmitCondition("arbitrator", undefined)).toBe(false);
    expect(canSubmitCondition("seller", verification("verification_failed"))).toBe(true);
    expect(canSubmitCondition("seller", verification("verified"))).toBe(false);
  });

  it("maps technical failures to safe user-facing messages", () => {
    expect(failureLabel("SUBJECT_MISMATCH")).toContain("sender");
    expect(failureLabel("WRONG_RECIPIENT")).toContain("recipient");
    expect(failureLabel("WRONG_ASSET")).toContain("token");
    expect(failureLabel("WRONG_AMOUNT")).toContain("amount");
    expect(failureLabel("WRONG_EVENT")).toContain("did not succeed");
    expect(failureLabel(undefined)).not.toContain("0x");
  });
});
