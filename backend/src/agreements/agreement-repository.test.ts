import { ZeroAddress, id } from "ethers";
import { describe, expect, it } from "vitest";
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
  });

  it("uses placeholders and keeps values outside SQL text", async () => {
    const calls: Array<{ text: string; values: readonly unknown[] }> = [];
    const repository = new SqlAgreementRepository({
      async query(text, values) {
        calls.push({ text, values });
        return { rows: [] };
      },
    });
    await repository.createAgreement(record);
    expect(calls[0]?.text).toContain("$1");
    expect(calls[0]?.text).not.toContain(record.buyer);
    expect(calls[0]?.values).toContain(record.buyer);
  });
});
