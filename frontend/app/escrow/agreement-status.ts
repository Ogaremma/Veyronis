import type { AgreementDashboardItem, ParticipantRole } from "@veyronis/shared";

const closedStates = new Set(["Complete", "Refunded", "Cancelled"]);

export function isClosedAgreement(item: AgreementDashboardItem): boolean {
  return item.chain?.state ? closedStates.has(item.chain.state) : false;
}

export function agreementDisplayStatus(item: AgreementDashboardItem): string {
  return item.chain?.state ?? "Not deployed";
}

export function agreementCounterparty(item: AgreementDashboardItem): string {
  if (item.role === "buyer") return shortAddress(item.metadata.seller);
  if (item.role === "seller") return shortAddress(item.metadata.buyer);
  return `${shortAddress(item.metadata.buyer)} / ${shortAddress(item.metadata.seller)}`;
}

export function agreementAction(item: AgreementDashboardItem): string {
  if (!item.chain) return "Open Agreement";
  if (item.role === "buyer" && item.chain.state === "AwaitingPayment") return "Fund Contract";
  if (item.role === "arbitrator" && item.chain.state === "Disputed") return "Review Dispute";
  if (isClosedAgreement(item)) return "View History";
  return "Open Contract";
}

export function roleLabel(role: ParticipantRole): string {
  return role.charAt(0).toUpperCase() + role.slice(1);
}

export function shortAddress(address: string): string {
  return `${address.slice(0, 8)}...${address.slice(-6)}`;
}
