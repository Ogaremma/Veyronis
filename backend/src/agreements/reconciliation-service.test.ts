import { ZeroAddress, id } from "ethers";
import { describe, expect, it } from "vitest";
import type { AgreementMetadata } from "@veyronis/shared";
import { AgreementReconciliationService } from "./reconciliation-service.js";

const buyer = "0x1000000000000000000000000000000000000001";
const seller = "0x2000000000000000000000000000000000000002";
const arbitrator = "0x3000000000000000000000000000000000000003";
const escrow = "0x4000000000000000000000000000000000000004";
const metadata = {
  id: id("id"), buyer, seller, arbitrator, escrowAddress: escrow, requiredAmount: "100",
  agreementNonce: id("nonce"), agreementCommitment: id("agreement"), evidencePolicyCommitment: id("policy"),
  evidenceRegistry: "0x5000000000000000000000000000000000000005", deploymentStatus: "DEPLOYED",
  createdAt: new Date(0).toISOString(), updatedAt: new Date(0).toISOString(),
  policy: { version: 1, evidenceType: id("SOURCE_PAYMENT"), sourceChainKey: 1, assetKind: "native",
    expectedSourceContract: ZeroAddress, expectedRecipient: seller, expectedAsset: ZeroAddress,
    expectedSender: buyer, amountRule: "exact", amount: "100", minSourceBlock: "0", maxSourceBlock: "0",
    calldataSelector: "0x00000000", requireTransferEvent: false },
} satisfies AgreementMetadata;

function service(requiredAmount = "100") {
  return new AgreementReconciliationService({ async read() { return { timeline: [], snapshot: {
    escrowAddress: escrow, buyer, seller, arbitrator, requiredAmount,
    agreementCommitment: metadata.agreementCommitment, evidencePolicyCommitment: metadata.evidencePolicyCommitment,
    state: "AwaitingDelivery", depositedAmount: "100", activeEvidenceCommitment: id("evidence"),
    verifiedClaimId: ZeroAddress.padEnd(66, "0"), withdrawalAmount: "0", blockNumber: "12",
  } }; } });
}

describe("agreement reconciliation", () => {
  it("reports a successful authoritative comparison", async () => {
    const result = await service().reconcile(metadata, buyer);
    expect(result.reconciliation).toMatchObject({ status: "MATCHED", authoritativeSource: "BLOCKCHAIN", checkedAtBlock: "12" });
  });

  it("reports stale metadata while retaining the chain value", async () => {
    const result = await service("250").reconcile(metadata, buyer);
    expect(result.reconciliation.status).toBe("METADATA_STALE");
    expect(result.reconciliation.mismatches).toContain("required amount");
    expect(result.snapshot.requiredAmount).toBe("250");
  });
});
