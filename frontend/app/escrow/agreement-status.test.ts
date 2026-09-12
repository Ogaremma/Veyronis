import { describe, expect, it } from "vitest";
import type {
  AgreementDashboardItem,
  AgreementDiscoveryItem,
  AgreementMetadata,
} from "@veyronis/shared";
import {
  agreementAction,
  agreementCounterparty,
  agreementDisplayStatus,
  discoveryAction,
  discoveryCounterparty,
  discoveryDisplayStatus,
  isClosedAgreement,
  isClosedDiscoveryAgreement,
  roleForDiscoveryAgreement,
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

function discoveryItem(
  state: AgreementDiscoveryItem["state"],
): AgreementDiscoveryItem {
  return {
    id: "0x1",
    escrowAddress: "0x5000000000000000000000000000000000000005",
    buyer: metadata.buyer,
    seller: metadata.seller,
    arbitrator: metadata.arbitrator,
    network: "sepolia",
    requiredAmount: metadata.requiredAmount,
    state,
    createdAt: "2024-01-01T00:00:00.000Z",
    updatedAt: "2024-01-01T00:00:00.000Z",
    status: state === "Complete" || state === "Refunded" || state === "Cancelled"
      ? "closed"
      : "live",
  };
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

  it("classifies public discovery items as live or closed", () => {
    expect(isClosedDiscoveryAgreement(discoveryItem("Complete"))).toBe(true);
    expect(isClosedDiscoveryAgreement(discoveryItem("Refunded"))).toBe(true);
    expect(isClosedDiscoveryAgreement(discoveryItem("Cancelled"))).toBe(true);
    expect(isClosedDiscoveryAgreement(discoveryItem("AwaitingPayment"))).toBe(false);
    expect(isClosedDiscoveryAgreement(discoveryItem("AwaitingDelivery"))).toBe(false);
    expect(isClosedDiscoveryAgreement(discoveryItem("Disputed"))).toBe(false);
  });

  it("returns the participant role for the current wallet only", () => {
    const item = discoveryItem("AwaitingPayment");
    expect(roleForDiscoveryAgreement(item, item.buyer)).toBe("buyer");
    expect(roleForDiscoveryAgreement(item, item.seller)).toBe("seller");
    expect(roleForDiscoveryAgreement(item, item.arbitrator)).toBe("arbitrator");
    expect(roleForDiscoveryAgreement(item, "0x9000000000000000000000000000000000000009")).toBeUndefined();
    expect(roleForDiscoveryAgreement(item, undefined)).toBeUndefined();
  });

  it("recognizes the production seller regardless of address casing", () => {
    const item = { ...discoveryItem("AwaitingDelivery"), seller: "0x4C9dE9AEFb29Fc33CCeFbd048b244aBEf251Db02" };
    expect(roleForDiscoveryAgreement(item, item.seller)).toBe("seller");
    expect(roleForDiscoveryAgreement(item, item.seller.toLowerCase())).toBe("seller");
    expect(roleForDiscoveryAgreement(item, item.buyer)).toBe("buyer");
  });

  it("shows read-only actions and counterparties for public discovery", () => {
    const item = discoveryItem("AwaitingDelivery");
    expect(discoveryDisplayStatus(item)).toBe("AwaitingDelivery");
    expect(discoveryAction(item, undefined)).toBe("Read only");
    expect(discoveryAction(item, "buyer")).toBe("Open Contract");
    expect(discoveryAction(discoveryItem("AwaitingPayment"), "buyer")).toBe("Fund Contract");
    expect(discoveryCounterparty(item, "buyer")).toBe("0x200000...000002");
    expect(discoveryCounterparty(item, undefined)).toBe("0x100000...000001 / 0x200000...000002");
  });
});
