import { describe, expect, it } from "vitest";
import type {
  AgreementDashboardItem,
  AgreementMetadata,
} from "@veyronis/shared";
import {
  agreementAction,
  agreementCounterparty,
  agreementDisplayStatus,
  isClosedAgreement,
} from "./agreement-status";

const metadata = {
  buyer: "0x1000000000000000000000000000000000000001",
  seller: "0x2000000000000000000000000000000000000002",
  arbitrator: "0x3000000000000000000000000000000000000003",
  requiredAmount: "100",
} as AgreementMetadata;

function item(role: "buyer" | "seller" | "arbitrator", state?: string) {
  return {
    metadata,
    role,
    ...(state ? { chain: { state } } : {}),
  } as AgreementDashboardItem;
}

describe("live contract status", () => {
  it("classifies live and closed contracts from authoritative chain state", () => {
    expect(isClosedAgreement(item("buyer", "Complete"))).toBe(true);
    expect(isClosedAgreement(item("buyer", "Refunded"))).toBe(true);
    expect(isClosedAgreement(item("buyer", "Cancelled"))).toBe(true);
    expect(isClosedAgreement(item("buyer", "AwaitingPayment"))).toBe(false);
    expect(isClosedAgreement(item("buyer", "AwaitingDelivery"))).toBe(false);
    expect(isClosedAgreement(item("buyer", "Disputed"))).toBe(false);
    expect(isClosedAgreement(item("buyer"))).toBe(false);
    expect(agreementDisplayStatus(item("buyer"))).toBe("Not deployed");
  });

  it("shows participant-specific actions and counterparties", () => {
    expect(agreementAction(item("buyer", "AwaitingPayment"))).toBe("Fund Contract");
    expect(agreementAction(item("arbitrator", "Disputed"))).toBe("Review Dispute");
    expect(agreementAction(item("seller", "Complete"))).toBe("View History");
    expect(agreementAction(item("buyer"))).toBe("Open Agreement");
    expect(agreementCounterparty(item("buyer", "AwaitingPayment"))).toBe("0x200000...000002");
    expect(agreementCounterparty(item("seller", "AwaitingDelivery"))).toBe("0x100000...000001");
  });
});
