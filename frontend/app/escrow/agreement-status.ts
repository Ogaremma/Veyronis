import {
  isTerminalEscrowState,
  type AgreementDashboardItem,
  type AgreementDiscoveryItem,
  type ParticipantRole,
} from "@veyronis/shared";

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

export function roleForDiscoveryAgreement(
  item: AgreementDiscoveryItem,
  walletAddress: string | undefined,
): ParticipantRole | undefined {
  if (!walletAddress) return undefined;
  const normalized = walletAddress.toLowerCase();
  if (item.buyer.toLowerCase() === normalized) return "buyer";
  if (item.seller.toLowerCase() === normalized) return "seller";
  if (item.arbitrator.toLowerCase() === normalized) return "arbitrator";
  return undefined;
}

export function isClosedDiscoveryAgreement(
  item: AgreementDiscoveryItem,
): boolean {
  return isTerminalEscrowState(item.state);
}

export function discoveryDisplayStatus(item: AgreementDiscoveryItem): string {
  return item.state;
}

export function discoveryCounterparty(
  item: AgreementDiscoveryItem,
  role: ParticipantRole | undefined,
): string {
  if (role === "buyer") return shortAddress(item.seller);
  if (role === "seller") return shortAddress(item.buyer);
  return `${shortAddress(item.buyer)} / ${shortAddress(item.seller)}`;
}

export function discoveryAction(
  item: AgreementDiscoveryItem,
  role: ParticipantRole | undefined,
): string {
  if (!role) return "Read only";
  if (role === "buyer" && item.state === "AwaitingPayment")
    return "Fund Contract";
  if (role === "arbitrator" && item.state === "Disputed")
    return "Review Dispute";
  if (isClosedDiscoveryAgreement(item)) return "View History";
  return "Open Contract";
}
