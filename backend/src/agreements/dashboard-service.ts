import { getAddress } from "ethers";
import type {
  AgreementLifecycleMode,
  AgreementDiscoveryItem,
  AgreementAction,
  AgreementDetails,
  AgreementMetadata,
  EscrowState,
  ParticipantRole,
} from "@veyronis/shared";
import {
  agreementLifecycleMode,
  canWithdrawEscrowFunds,
  externalBlockchainConditionFromPolicy,
  isTerminalEscrowState,
} from "@veyronis/shared";
import type { AgreementRepository } from "./agreement-repository.js";
import type { AgreementContractReader } from "./contract-read-layer.js";
import { AgreementReconciliationService } from "./reconciliation-service.js";
import type { AgreementConditionVerificationRepository } from "./agreement-condition-repository.js";

export class AgreementDashboardService {
  private readonly reconciliation: AgreementReconciliationService;
  constructor(
    private readonly repository: AgreementRepository,
    private readonly reader: AgreementContractReader,
    private readonly network = "sepolia",
    private readonly conditions?: AgreementConditionVerificationRepository,
  ) {
    this.reconciliation = new AgreementReconciliationService(reader);
  }

  async listDiscovery(): Promise<AgreementDiscoveryItem[]> {
    const agreements = await this.repository.listDeployedAgreements();
    return Promise.all(
      agreements.map(async (metadata) => {
        if (!metadata.escrowAddress)
          throw new Error("Agreement is not deployed");
        const snapshot = await this.reader.readSnapshot(
          metadata.escrowAddress,
          metadata.buyer,
        );
        const condition = externalBlockchainConditionFromPolicy(
          metadata.policy,
        );
        return {
          id: metadata.id,
          escrowAddress: metadata.escrowAddress,
          buyer: metadata.buyer,
          seller: metadata.seller,
          arbitrator: metadata.arbitrator,
          network: this.network,
          requiredAmount: metadata.requiredAmount,
          state: snapshot.state,
          createdAt: metadata.createdAt,
          updatedAt: metadata.updatedAt,
          status: isTerminalEscrowState(snapshot.state) ? "closed" : "live",
          lifecycle: agreementLifecycleMode(metadata),
          ...(condition
            ? {
                condition,
                verificationStatus:
                  (await this.conditions?.latestVerification(metadata.id))
                    ?.status ?? "pending",
              }
            : {}),
        };
      }),
    );
  }

  async list(addressInput: string) {
    const address = getAddress(addressInput);
    const agreements =
      await this.repository.listAgreementsForParticipant(address);
    return Promise.all(
      agreements.map(async (metadata) => {
        const exposedMetadata = metadataForParticipant(metadata);
        const role = roleFor(metadata, address);
        if (!metadata.escrowAddress) return { metadata: exposedMetadata, role };
        try {
          const result = await this.reconciliation.reconcile(
            exposedMetadata,
            address,
          );
          await this.repository.recordReconciliation({
            agreementId: metadata.id,
            ...result.reconciliation,
          });
          return { metadata: exposedMetadata, role, chain: result.snapshot };
        } catch {
          return {
            metadata: exposedMetadata,
            role,
            chain: await this.reader.readSnapshot(
              metadata.escrowAddress,
              address,
            ),
          };
        }
      }),
    );
  }
  async details(id: string, addressInput: string): Promise<AgreementDetails> {
    const address = getAddress(addressInput);
    const storedMetadata = await this.repository.getAgreementById(id);
    const metadata = storedMetadata
      ? metadataForParticipant(storedMetadata)
      : undefined;
    if (!metadata) throw new Error("Agreement not found");
    const role = roleFor(metadata, address);
    if (!metadata.escrowAddress)
      return { metadata, role, timeline: [], actions: [] };
    try {
      const { snapshot, timeline, reconciliation } =
        await this.reconciliation.reconcile(metadata, address);
      await this.repository.recordReconciliation({
        agreementId: metadata.id,
        ...reconciliation,
      });
      return {
        metadata,
        role,
        chain: snapshot,
        timeline,
        reconciliation,
        actions: actionsFor(
          role,
          snapshot.state,
          BigInt(snapshot.withdrawalAmount),
          agreementLifecycleMode(metadata),
        ),
      };
    } catch {
      const snapshot = await this.reader.readSnapshot(
        metadata.escrowAddress,
        address,
      );
      return {
        metadata,
        role,
        chain: snapshot,
        timeline: [],
        actions: actionsFor(
          role,
          snapshot.state,
          BigInt(snapshot.withdrawalAmount),
          agreementLifecycleMode(metadata),
        ),
      };
    }
  }
}
function roleFor(
  agreement: AgreementMetadata,
  address: string,
): ParticipantRole {
  for (const role of ["buyer", "seller", "arbitrator"] as const)
    if (getAddress(agreement[role]) === address) return role;
  throw new Error("Not an agreement participant");
}

function metadataForParticipant(
  metadata: AgreementMetadata,
): AgreementMetadata {
  if (agreementLifecycleMode(metadata) !== "blockchain_condition_only")
    return metadata;
  if (!metadata.deliverables) return metadata;
  return { ...metadata, deliverables: [] };
}

export function actionsFor(
  role: ParticipantRole,
  state: EscrowState,
  withdrawal: bigint,
  lifecycle: AgreementLifecycleMode = "application_work_evidence",
): AgreementAction[] {
  const actions: AgreementAction[] = [];
  if (lifecycle === "blockchain_condition_only") {
    if (role === "buyer" && state === "AwaitingPayment")
      actions.push("deposit", "cancel");
    if (canWithdrawEscrowFunds(role, state, withdrawal))
      actions.push("withdraw");
    return actions;
  }
  if (role === "buyer" && state === "AwaitingPayment")
    actions.push("deposit", "cancel");
  if (role === "buyer" && state === "AwaitingDelivery") {
    actions.push("confirmDelivery");
    actions.push("requestRefund");
    actions.push("openDispute");
  }
  if (role === "seller" && state === "AwaitingDelivery")
    actions.push("openDispute");
  if (role === "seller" && state === "RefundRequested")
    actions.push("approveRefund", "openDispute");
  if (role === "buyer" && state === "RefundRequested")
    actions.push("openDispute");
  if (role === "arbitrator" && state === "Disputed")
    actions.push("resolveRelease", "resolveRefund");
  if (canWithdrawEscrowFunds(role, state, withdrawal)) {
    actions.push("withdraw");
  }
  return actions;
}
