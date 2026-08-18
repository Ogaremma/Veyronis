import { getAddress } from "ethers";
import type {
  AgreementAction,
  AgreementDetails,
  AgreementMetadata,
  ParticipantRole,
} from "@veyronis/shared";
import type { AgreementRepository } from "./agreement-repository.js";
import type { AgreementContractReader } from "./contract-read-layer.js";
import { AgreementReconciliationService } from "./reconciliation-service.js";

export class AgreementDashboardService {
  private readonly reconciliation: AgreementReconciliationService;
  constructor(
    private readonly repository: AgreementRepository,
    private readonly reader: AgreementContractReader,
  ) {
    this.reconciliation = new AgreementReconciliationService(reader);
  }
  async list(addressInput: string) {
    const address = getAddress(addressInput);
    const agreements =
      await this.repository.listAgreementsForParticipant(address);
    return Promise.all(
      agreements.map(async (metadata) => {
        if (!metadata.escrowAddress) return { metadata, role: roleFor(metadata, address) };
        const result = await this.reconciliation.reconcile(metadata, address);
        await this.repository.recordReconciliation({ agreementId: metadata.id, ...result.reconciliation });
        return { metadata, role: roleFor(metadata, address), chain: result.snapshot };
      }),
    );
  }
  async details(id: string, addressInput: string): Promise<AgreementDetails> {
    const address = getAddress(addressInput);
    const metadata = await this.repository.getAgreementById(id);
    if (!metadata) throw new Error("Agreement not found");
    const role = roleFor(metadata, address);
    if (!metadata.escrowAddress)
      return { metadata, role, timeline: [], actions: [] };
    const { snapshot, timeline, reconciliation } =
      await this.reconciliation.reconcile(metadata, address);
    await this.repository.recordReconciliation({ agreementId: metadata.id, ...reconciliation });
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
      ),
    };
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
export function actionsFor(
  role: ParticipantRole,
  state: string,
  withdrawal: bigint,
): AgreementAction[] {
  const actions: AgreementAction[] = [];
  if (role === "buyer" && state === "AwaitingPayment")
    actions.push("deposit", "cancel");
  if (role === "buyer" && state === "AwaitingDelivery")
    actions.push("confirmDelivery", "requestRefund", "openDispute");
  if (role === "seller" && state === "AwaitingDelivery")
    actions.push("openDispute");
  if (role === "seller" && state === "RefundRequested")
    actions.push("approveRefund", "openDispute");
  if (role === "buyer" && state === "RefundRequested")
    actions.push("openDispute");
  if (role === "arbitrator" && state === "Disputed")
    actions.push("resolveRelease", "resolveRefund");
  if (withdrawal > 0n) actions.push("withdraw");
  return actions;
}
