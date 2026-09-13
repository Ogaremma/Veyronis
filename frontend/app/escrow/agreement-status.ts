import {
  agreementLifecycleMode,
  isTerminalEscrowState,
  type AgreementConditionVerification,
  type AgreementDashboardItem,
  type AgreementDiscoveryItem,
  type ParticipantRole,
} from "@veyronis/shared";

const closedStates = new Set(["Complete", "Refunded", "Cancelled"]);

export function isClosedAgreement(item: AgreementDashboardItem): boolean {
  return item.chain?.state ? closedStates.has(item.chain.state) : false;
}

export function agreementDisplayStatus(
  item: AgreementDashboardItem,
  conditionVerification?: AgreementConditionVerification,
): string {
  if (!item.chain) return "Not deployed";
  if (
    agreementLifecycleMode(item.metadata) === "blockchain_condition_only" &&
    item.chain.state === "AwaitingDelivery"
  ) {
    return "Verification Pending";
  }
  if (
    agreementLifecycleMode(item.metadata) === "blockchain_condition_only" &&
    item.chain.state === "Complete" &&
    conditionVerification?.status === "verified"
  ) {
    return "Verified / Payment Unlocked";
  }
  return item.chain.state;
}

export function agreementCounterparty(item: AgreementDashboardItem): string {
  if (item.role === "buyer") return shortAddress(item.metadata.seller);
  if (item.role === "seller") return shortAddress(item.metadata.buyer);
  return `${shortAddress(item.metadata.buyer)} / ${shortAddress(item.metadata.seller)}`;
}

export function agreementAction(item: AgreementDashboardItem): string {
  if (!item.chain) return "Open Agreement";
  if (item.role === "buyer" && item.chain.state === "AwaitingPayment")
    return "Fund Contract";
  if (item.role === "arbitrator" && item.chain.state === "Disputed")
    return "Review Dispute";
  if (isClosedAgreement(item)) return "View History";
  return "Open Escrow";
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
  if (
    item.lifecycle === "blockchain_condition_only" &&
    item.state === "AwaitingDelivery"
  ) {
    return "Verification Pending";
  }
  if (
    item.lifecycle === "blockchain_condition_only" &&
    item.state === "Complete" &&
    item.verificationStatus === "verified"
  ) {
    return "Verified / Payment Unlocked";
  }
  return item.state;
}

export function agreementStatusTone(
  status: string,
): "blue" | "green" | "amber" | "red" {
  if (status === "AwaitingPayment" || status === "RefundRequested")
    return "amber";
  if (status === "Verification Pending") return "blue";
  if (status === "Verified / Payment Unlocked" || status === "Complete")
    return "green";
  if (status === "Disputed") return "red";
  return "blue";
}

export function discoveryConditionLabel(item: AgreementDiscoveryItem): string {
  if (item.lifecycle === "blockchain_condition_only")
    return "External blockchain action";
  if (item.lifecycle === "hybrid") return "Blockchain + work evidence";
  return "Application work evidence";
}

export function discoveryVerificationLabel(
  item: AgreementDiscoveryItem,
): string {
  if (
    item.lifecycle !== "blockchain_condition_only" &&
    item.lifecycle !== "hybrid"
  ) {
    return "Not applicable";
  }
  if (item.verificationStatus === "verified") {
    return item.state === "Complete"
      ? "Verified / Payment Unlocked"
      : "Verified";
  }
  if (item.verificationStatus === "verification_in_progress")
    return "Verification in progress";
  if (item.verificationStatus === "verification_failed")
    return "Verification failed";
  return "Verification pending";
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
  return "Open Escrow";
}
