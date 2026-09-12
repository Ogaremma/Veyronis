import { describe, expect, it, vi } from "vitest";
import { ZeroAddress, id } from "ethers";
import type {
  AgreementChainSnapshot,
  AgreementDiscoveryItem,
  AgreementMetadata,
} from "@veyronis/shared";
import { InMemoryAgreementRepository } from "./agreement-repository.js";
import { actionsFor } from "./dashboard-service.js";
import { AgreementDashboardService } from "./dashboard-service.js";

const metadata: AgreementMetadata = {
  id: id("agreement"),
  buyer: "0x1000000000000000000000000000000000000001",
  seller: "0x2000000000000000000000000000000000000002",
  arbitrator: "0x3000000000000000000000000000000000000003",
  evidenceRegistry: "0x4000000000000000000000000000000000000004",
  requiredAmount: "100",
  agreementNonce: id("nonce"),
  agreementCommitment: id("agreement"),
  evidencePolicyCommitment: id("policy"),
  deploymentStatus: "DEPLOYED",
  escrowAddress: "0x5000000000000000000000000000000000000005",
  createdAt: new Date(0).toISOString(),
  updatedAt: new Date(0).toISOString(),
  policy: {
    version: 1,
    evidenceType: id("SOURCE_PAYMENT"),
    sourceChainKey: 1,
    assetKind: "native",
    expectedSourceContract: ZeroAddress,
    expectedRecipient: "0x2000000000000000000000000000000000000002",
    expectedAsset: ZeroAddress,
    expectedSender: "0x1000000000000000000000000000000000000001",
    amountRule: "exact",
    amount: "100",
    minSourceBlock: "0",
    maxSourceBlock: "0",
    calldataSelector: "0x00000000",
    requireTransferEvent: false,
  },
};

const snapshot: AgreementChainSnapshot = {
  escrowAddress: metadata.escrowAddress!,
  buyer: metadata.buyer,
  seller: metadata.seller,
  arbitrator: metadata.arbitrator,
  requiredAmount: metadata.requiredAmount,
  agreementCommitment: metadata.agreementCommitment,
  evidencePolicyCommitment: metadata.evidencePolicyCommitment,
  state: "AwaitingPayment",
  depositedAmount: "0",
  activeEvidenceCommitment: id("zero"),
  verifiedClaimId: id("zero"),
  withdrawalAmount: "0",
  blockNumber: "10",
};

const closedEscrowAddress = "0x6000000000000000000000000000000000000006";
const closedMetadata: AgreementMetadata = {
  ...metadata,
  id: id("closed-agreement"),
  escrowAddress: closedEscrowAddress,
};

const closedSnapshot: AgreementChainSnapshot = {
  ...snapshot,
  escrowAddress: closedEscrowAddress,
  state: "Complete",
};
describe("participant-specific agreement actions", () => {
  it("only exposes actions permitted by role and authoritative chain state", () => {
    expect(actionsFor("buyer", "AwaitingPayment", 0n)).toEqual([
      "deposit",
      "cancel",
    ]);
    expect(actionsFor("seller", "RefundRequested", 0n)).toEqual([
      "approveRefund",
      "openDispute",
    ]);
    expect(actionsFor("arbitrator", "Disputed", 0n)).toEqual([
      "resolveRelease",
      "resolveRefund",
    ]);
    expect(actionsFor("seller", "Complete", 10n)).toEqual(["withdraw"]);
  });

  it("shows each authenticated participant their role and authoritative state", async () => {
    const repository = new InMemoryAgreementRepository();
    await repository.createAgreement(metadata);
    const reader = {
      read: vi.fn(async () => ({ snapshot, timeline: [] })),
      readSnapshot: vi.fn(async () => snapshot),
    };
    const service = new AgreementDashboardService(repository, reader);

    await expect(service.list(metadata.buyer)).resolves.toEqual([
      { metadata, role: "buyer", chain: snapshot },
    ]);
    await expect(service.list(metadata.seller)).resolves.toEqual([
      { metadata, role: "seller", chain: snapshot },
    ]);
    await expect(service.list(metadata.arbitrator)).resolves.toEqual([
      { metadata, role: "arbitrator", chain: snapshot },
    ]);
  });

  it("does not show an agreement to an unrelated authenticated wallet", async () => {
    const repository = new InMemoryAgreementRepository();
    await repository.createAgreement(metadata);
    const service = new AgreementDashboardService(repository, {
      read: vi.fn(),
      readSnapshot: vi.fn(),
    });

    await expect(service.list("0x9000000000000000000000000000000000000009")).resolves.toEqual([]);
  });

  it("returns a public, safe, and authoritative discovery list", async () => {
    const repository = new InMemoryAgreementRepository();
    await repository.createAgreement(metadata);
    await repository.createAgreement(closedMetadata);
    const reader = {
      readSnapshot: vi.fn(async (address: string) =>
        address === closedMetadata.escrowAddress ? closedSnapshot : snapshot,
      ),
      read: vi.fn(),
    };
    const service = new AgreementDashboardService(repository, reader, "sepolia");

    const items = await service.listDiscovery();

    expect(items).toEqual<AgreementDiscoveryItem[]>([
      {
        id: metadata.id,
        escrowAddress: metadata.escrowAddress!,
        buyer: metadata.buyer,
        seller: metadata.seller,
        arbitrator: metadata.arbitrator,
        network: "sepolia",
        requiredAmount: metadata.requiredAmount,
        state: "AwaitingPayment",
        createdAt: metadata.createdAt,
        updatedAt: metadata.updatedAt,
        status: "live",
      },
      {
        id: closedMetadata.id,
        escrowAddress: closedMetadata.escrowAddress!,
        buyer: closedMetadata.buyer,
        seller: closedMetadata.seller,
        arbitrator: closedMetadata.arbitrator,
        network: "sepolia",
        requiredAmount: closedMetadata.requiredAmount,
        state: "Complete",
        createdAt: closedMetadata.createdAt,
        updatedAt: closedMetadata.updatedAt,
        status: "closed",
      },
    ]);
    expect(reader.readSnapshot).toHaveBeenCalledTimes(2);
    expect(reader.read).not.toHaveBeenCalled();
    expect(Object.keys(items[0]!).sort()).toEqual([
      "arbitrator",
      "buyer",
      "createdAt",
      "escrowAddress",
      "id",
      "network",
      "requiredAmount",
      "seller",
      "state",
      "status",
      "updatedAt",
    ]);
  });
});
