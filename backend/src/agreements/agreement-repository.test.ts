import { ZeroAddress, id } from "ethers";
import { describe, expect, it, vi } from "vitest";
import type { AgreementMetadata } from "@veyronis/shared";
import {
  InMemoryAgreementRepository,
  SqlAgreementRepository,
} from "./agreement-repository.js";

const record: AgreementMetadata = {
  id: id("id"),
  buyer: "0x1000000000000000000000000000000000000001",
  seller: "0x2000000000000000000000000000000000000002",
  arbitrator: "0x3000000000000000000000000000000000000003",
  evidenceRegistry: "0x4000000000000000000000000000000000000004",
  requiredAmount: "100",
  agreementNonce: id("nonce"),
  agreementCommitment: id("agreement"),
  evidencePolicyCommitment: id("policy"),
  deploymentStatus: "AWAITING_CONFIRMATION",
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
  deliverables: [
    {
      id: "11111111-1111-4111-8111-111111111111",
      title: "Product shipment",
      description: "10 custom T-shirts delivered to buyer.",
      required: true,
      active: true,
      position: 0,
      evidenceRequirements: [
        {
          id: "22222222-2222-4222-8222-222222222222",
          label: "Product photos",
          kind: "PHOTO",
          required: true,
          configuration: {},
          position: 0,
        },
        {
          id: "33333333-3333-4333-8333-333333333333",
          label: "Tracking URL",
          kind: "TRACKING_URL",
          required: false,
          configuration: {},
          position: 1,
        },
      ],
    },
  ],
};

describe("agreement repositories", () => {
  it("creates, retrieves, lists, and updates metadata only", async () => {
    const repository = new InMemoryAgreementRepository();
    await repository.createAgreement(record);
    expect(
      (await repository.getAgreementById(record.id))?.agreementCommitment,
    ).toBe(record.agreementCommitment);
    expect(
      await repository.listAgreementsForParticipant(record.buyer),
    ).toHaveLength(1);
    await repository.updateDeploymentStatus(record.id, {
      status: "DEPLOYED",
      escrowAddress: record.evidenceRegistry,
    });
    expect(
      (await repository.getAgreementByEscrowAddress(record.evidenceRegistry))
        ?.deploymentStatus,
    ).toBe("DEPLOYED");
    expect((await repository.getAgreementById(record.id))?.deliverables)
      .toEqual(record.deliverables);
  });

  it("lists an agreement for each participant but not an unrelated wallet", async () => {
    const repository = new InMemoryAgreementRepository();
    await repository.createAgreement(record);

    expect(await repository.listAgreementsForParticipant(record.buyer)).toHaveLength(1);
    expect(await repository.listAgreementsForParticipant(record.seller)).toHaveLength(1);
    expect(await repository.listAgreementsForParticipant(record.arbitrator)).toHaveLength(1);
    expect(await repository.listAgreementsForParticipant("0x9000000000000000000000000000000000000009")).toEqual([]);
  });

  it("keeps immutable work evidence terms when deployment status changes", async () => {
    const repository = new InMemoryAgreementRepository();
    await repository.createAgreement(record);
    await repository.updateDeploymentStatus(record.id, {
      status: "DEPLOYED",
      escrowAddress: record.evidenceRegistry,
    });
    const updated = await repository.getAgreementById(record.id);
    expect(updated?.deliverables).toEqual(record.deliverables);
    expect(updated?.deploymentStatus).toBe("DEPLOYED");
  });

  it("inserts the complete agreement and evidence terms in one transaction", async () => {
    const database = createTransactionDatabase();
    const repository = new SqlAgreementRepository(database.executor);

    await repository.createAgreement(record);

    expect(database.events).toEqual(["BEGIN", "COMMIT"]);
    expect(database.rows.agreements).toHaveLength(1);
    expect(database.rows.deliverables).toHaveLength(1);
    expect(database.rows.requirements).toHaveLength(2);
    expect(database.release).toHaveBeenCalledOnce();
    expect(database.calls[1]?.text).toContain("$1");
    expect(database.calls[1]?.text).not.toContain(record.buyer);
    expect(database.calls[1]?.values).toContain(record.buyer);
    expect(database.calls[2]?.text).toContain("agreement_deliverables");
    expect(database.calls[3]?.text).toContain("agreement_evidence_requirements");
  });

  it("rolls back all agreement and evidence inserts when one term fails", async () => {
    const database = createTransactionDatabase({ failOnSecondRequirement: true });
    const repository = new SqlAgreementRepository(database.executor);

    await expect(repository.createAgreement(record)).rejects.toThrow(
      "requirement insert failed",
    );

    expect(database.events).toEqual(["BEGIN", "ROLLBACK"]);
    expect(database.rows.agreements).toEqual([]);
    expect(database.rows.deliverables).toEqual([]);
    expect(database.rows.requirements).toEqual([]);
    expect(database.release).toHaveBeenCalledOnce();
  });
});

function createTransactionDatabase(options?: { failOnSecondRequirement?: boolean }) {
  const calls: Array<{ text: string; values: readonly unknown[] }> = [];
  const events: string[] = [];
  const rows = {
    agreements: [] as unknown[],
    deliverables: [] as unknown[],
    requirements: [] as unknown[],
  };
  const release = vi.fn();
  const client = {
    release,
    async query(text: string, values: readonly unknown[]) {
      calls.push({ text, values });
      if (text === "BEGIN" || text === "COMMIT") {
        events.push(text);
        return { rows: [] };
      }
      if (text === "ROLLBACK") {
        events.push(text);
        rows.agreements = [];
        rows.deliverables = [];
        rows.requirements = [];
        return { rows: [] };
      }
      if (text.includes("INSERT INTO agreements")) {
        rows.agreements.push(values[0]);
        return { rows: [] };
      }
      if (text.includes("INSERT INTO agreement_deliverables")) {
        rows.deliverables.push(values[0]);
        return { rows: [] };
      }
      if (text.includes("INSERT INTO agreement_evidence_requirements")) {
        if (options?.failOnSecondRequirement && rows.requirements.length === 1)
          throw new Error("requirement insert failed");
        rows.requirements.push(values[0]);
        return { rows: [] };
      }
      return { rows: [] };
    },
  };
  return {
    calls,
    events,
    rows,
    release,
    executor: {
      connect: async () => client,
      query: client.query,
    },
  };
}
