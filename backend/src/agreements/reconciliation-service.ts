import { getAddress } from "ethers";
import type {
  AgreementChainSnapshot,
  AgreementMetadata,
  AgreementTimelineEvent,
} from "@veyronis/shared";
import type { AgreementContractReader } from "./contract-read-layer.js";

export interface AgreementReconciliation {
  status: "MATCHED" | "METADATA_STALE";
  authoritativeSource: "BLOCKCHAIN";
  mismatches: string[];
  checkedAtBlock: string;
}

export class AgreementReconciliationService {
  constructor(private readonly reader: AgreementContractReader) {}

  async reconcile(
    metadata: AgreementMetadata,
    participant: string,
  ): Promise<{
    snapshot: AgreementChainSnapshot;
    timeline: AgreementTimelineEvent[];
    reconciliation: AgreementReconciliation;
  }> {
    if (!metadata.escrowAddress) throw new Error("Agreement is not deployed");
    const result = await this.reader.read(
      metadata.escrowAddress,
      participant,
      metadata.deploymentBlockNumber,
    );
    const mismatches: string[] = [];
    compareAddress(mismatches, "escrow address", metadata.escrowAddress, result.snapshot.escrowAddress);
    compareAddress(mismatches, "buyer", metadata.buyer, result.snapshot.buyer);
    compareAddress(mismatches, "seller", metadata.seller, result.snapshot.seller);
    compareAddress(mismatches, "arbitrator", metadata.arbitrator, result.snapshot.arbitrator);
    compare(mismatches, "required amount", metadata.requiredAmount, result.snapshot.requiredAmount);
    compare(mismatches, "agreement commitment", metadata.agreementCommitment, result.snapshot.agreementCommitment);
    compare(mismatches, "evidence policy commitment", metadata.evidencePolicyCommitment, result.snapshot.evidencePolicyCommitment);
    return {
      ...result,
      reconciliation: {
        status: mismatches.length === 0 ? "MATCHED" : "METADATA_STALE",
        authoritativeSource: "BLOCKCHAIN",
        mismatches,
        checkedAtBlock: result.snapshot.blockNumber,
      },
    };
  }
}

function compare(mismatches: string[], field: string, metadata: string, chain: string) {
  if (metadata.toLowerCase() !== chain.toLowerCase()) mismatches.push(field);
}

function compareAddress(mismatches: string[], field: string, metadata: string, chain: string) {
  if (getAddress(metadata) !== getAddress(chain)) mismatches.push(field);
}
