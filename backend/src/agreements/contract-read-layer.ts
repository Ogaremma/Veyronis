import { Contract, Interface, getAddress, type Provider } from "ethers";
import type {
  AgreementChainSnapshot,
  AgreementTimelineEvent,
} from "@veyronis/shared";

export const escrowAbi = [
  "function buyer() view returns (address)",
  "function seller() view returns (address)",
  "function arbitrator() view returns (address)",
  "function requiredAmount() view returns (uint256)",
  "function agreementCommitment() view returns (bytes32)",
  "function evidencePolicyCommitment() view returns (bytes32)",
  "function evidenceRegistry() view returns (address)",
  "function state() view returns (uint8)",
  "function depositedAmount() view returns (uint256)",
  "function activeEvidenceCommitment() view returns (bytes32)",
  "function verifiedClaimId() view returns (bytes32)",
  "function withdrawals(address) view returns (uint256)",
  "function deposit() payable",
  "function cancel()",
  "function confirmDelivery()",
  "function requestRefund(bytes32)",
  "function approveRefund()",
  "function openDispute(bytes32)",
  "function resolveDispute(uint8)",
  "function withdraw()",
  "event Deposited(uint256 amount)",
  "event DeliveryConfirmed()",
  "event RefundRequested(bytes32 indexed evidenceCommitment)",
  "event RefundApproved()",
  "event DisputeOpened(bytes32 indexed evidenceCommitment)",
  "event DisputeResolved(uint8 resolution)",
  "event Cancelled()",
  "event WithdrawalCredited(address indexed recipient,uint256 amount)",
  "event Withdrawn(address indexed recipient,uint256 amount)",
  "event VerifiedEvidenceRecorded(bytes32 indexed claimId,bytes32 indexed evidenceCommitment)",
] as const;
const registryAbi = [
  "event VerifiedClaimAccepted(bytes32 indexed claimId,address indexed escrow,bytes32 indexed evidenceCommitment,bytes32 sourceEvidenceKey)",
] as const;
const states = [
  "AwaitingPayment",
  "AwaitingDelivery",
  "RefundRequested",
  "Disputed",
  "Complete",
  "Refunded",
  "Cancelled",
] as const;

export interface AgreementContractReader {
  read(
    address: string,
    participant: string,
    fromBlock?: string,
  ): Promise<{
    snapshot: AgreementChainSnapshot;
    timeline: AgreementTimelineEvent[];
  }>;
}

export class EthersAgreementContractReader implements AgreementContractReader {
  private readonly iface = new Interface(escrowAbi);
  private readonly registryInterface = new Interface(registryAbi);
  constructor(private readonly provider: Provider) {}
  async read(addressInput: string, participant: string, fromBlock = "0") {
    const address = getAddress(addressInput);
    const contract = new Contract(address, escrowAbi, this.provider);
    const blockNumber = await this.provider.getBlockNumber();
    const [
      buyer,
      seller,
      arbitrator,
      requiredAmount,
      agreementCommitment,
      evidencePolicyCommitment,
      evidenceRegistry,
      state,
      deposited,
      evidence,
      claim,
      withdrawal,
      logs,
    ] =
      await Promise.all([
        contract.getFunction("buyer")(),
        contract.getFunction("seller")(),
        contract.getFunction("arbitrator")(),
        contract.getFunction("requiredAmount")(),
        contract.getFunction("agreementCommitment")(),
        contract.getFunction("evidencePolicyCommitment")(),
        contract.getFunction("evidenceRegistry")(),
        contract.getFunction("state")(),
        contract.getFunction("depositedAmount")(),
        contract.getFunction("activeEvidenceCommitment")(),
        contract.getFunction("verifiedClaimId")(),
        contract.getFunction("withdrawals")(participant),
        this.provider.getLogs({
          address,
          fromBlock: Number(fromBlock),
          toBlock: blockNumber,
        }),
      ]);
    const registryLogs = await this.provider.getLogs({
      address: String(evidenceRegistry),
      topics: [
        this.registryInterface.getEvent("VerifiedClaimAccepted")!.topicHash,
        null,
        `0x${address.slice(2).toLowerCase().padStart(64, "0")}`,
      ],
      fromBlock: Number(fromBlock),
      toBlock: blockNumber,
    });
    const allLogs = [...logs, ...registryLogs].sort(
      (left, right) =>
        left.blockNumber - right.blockNumber || left.index - right.index,
    );
    const transactionSenders = new Map<string, string>();
    const blockTimestamps = new Map<number, string>();
    await Promise.all([
      ...new Set(allLogs.map((log) => log.transactionHash)),
    ].map(async (hash) => {
      const transaction = await this.provider.getTransaction(hash);
      if (transaction) transactionSenders.set(hash, transaction.from);
    }));
    await Promise.all([...new Set(allLogs.map((log) => log.blockNumber))].map(async (number) => {
      const block = await this.provider.getBlock(number);
      if (block) blockTimestamps.set(number, new Date(block.timestamp * 1000).toISOString());
    }));
    const timeline = allLogs.flatMap((log) => {
      try {
        const parsed =
          log.address.toLowerCase() === address.toLowerCase()
            ? this.iface.parseLog(log)
            : this.registryInterface.parseLog(log);
        if (!parsed) return [];
        const actor = transactionSenders.get(log.transactionHash);
        const timestamp = blockTimestamps.get(log.blockNumber);
        const event: AgreementTimelineEvent = {
          transactionHash: log.transactionHash,
          blockNumber: String(log.blockNumber),
          logIndex: log.index,
          name: parsed.name,
          advisory: parsed.name === "VerifiedEvidenceRecorded",
          ...(actor ? { actor } : {}),
          ...(timestamp ? { timestamp } : {}),
        };
        if (parsed.name === "Deposited") event.amount = String(parsed.args[0]);
        if (
          parsed.name === "RefundRequested" ||
          parsed.name === "DisputeOpened"
        )
          event.evidenceCommitment = String(parsed.args[0]);
        if (parsed.name === "VerifiedEvidenceRecorded") {
          event.claimId = String(parsed.args[0]);
          event.evidenceCommitment = String(parsed.args[1]);
        }
        if (parsed.name === "VerifiedClaimAccepted") {
          event.claimId = String(parsed.args[0]);
          event.evidenceCommitment = String(parsed.args[2]);
          event.advisory = true;
        }
        if (
          parsed.name === "WithdrawalCredited" ||
          parsed.name === "Withdrawn"
        ) {
          event.actor = String(parsed.args[0]);
          event.amount = String(parsed.args[1]);
        }
        if (parsed.name === "DisputeResolved")
          event.resolution =
            Number(parsed.args[0]) === 0 ? "ReleaseToSeller" : "RefundBuyer";
        return [event];
      } catch {
        return [];
      }
    });
    return {
      snapshot: {
        escrowAddress: address,
        buyer: String(buyer),
        seller: String(seller),
        arbitrator: String(arbitrator),
        requiredAmount: String(requiredAmount),
        agreementCommitment: String(agreementCommitment),
        evidencePolicyCommitment: String(evidencePolicyCommitment),
        state: states[Number(state)]!,
        depositedAmount: String(deposited),
        activeEvidenceCommitment: String(evidence),
        verifiedClaimId: String(claim),
        withdrawalAmount: String(withdrawal),
        blockNumber: String(blockNumber),
      },
      timeline,
    };
  }
}
