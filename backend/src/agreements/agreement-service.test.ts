import { ZeroAddress, id } from "ethers";
import { describe, expect, it } from "vitest";
import type { AgreementDraft } from "@veyronis/shared";
import {
  computeAgreementCommitment,
  computeEvidencePolicyCommitment,
} from "@veyronis/shared";
import { AgreementCreationService } from "./agreement-service.js";
import { InMemoryAgreementRepository } from "./agreement-repository.js";
import type { EscrowDeploymentGateway } from "./escrow-deployer.js";

const buyer = "0x1000000000000000000000000000000000000001";
const seller = "0x2000000000000000000000000000000000000002";
const arbitrator = "0x3000000000000000000000000000000000000003";
const registry = "0x4000000000000000000000000000000000000004";
const draft: AgreementDraft = {
  buyer,
  seller,
  arbitrator,
  evidenceRegistry: registry,
  requiredAmount: "100",
  agreementNonce: id("agreement nonce"),
  policy: {
    version: 1,
    evidenceType: id("SOURCE_PAYMENT"),
    sourceChainKey: 1,
    assetKind: "native",
    expectedSourceContract: ZeroAddress,
    expectedRecipient: seller,
    expectedAsset: ZeroAddress,
    expectedSender: buyer,
    amountRule: "exact",
    amount: "100",
    minSourceBlock: "0",
    maxSourceBlock: "0",
    calldataSelector: "0x00000000",
    requireTransferEvent: false,
  },
};

class FakeDeployer implements EscrowDeploymentGateway {
  fail = false;
  input: Parameters<EscrowDeploymentGateway["deploy"]>[0] | undefined;
  async deploy(input: Parameters<EscrowDeploymentGateway["deploy"]>[0]) {
    this.input = input;
    if (this.fail) throw new Error("provider details must not escape");
    return {
      escrowAddress: registry,
      transactionHash: id("deployment"),
      blockNumber: "42",
    };
  }
}

describe("AgreementCreationService", () => {
  it("prepares canonical commitments and requires confirmation", async () => {
    const repository = new InMemoryAgreementRepository();
    const service = new AgreementCreationService(
      repository,
      new FakeDeployer(),
    );
    const prepared = await service.prepare(draft);
    expect(prepared.confirmationRequired).toBe(true);
    expect(prepared.agreement.deploymentStatus).toBe("AWAITING_CONFIRMATION");
    expect(prepared.agreement.evidencePolicyCommitment).toBe(
      computeEvidencePolicyCommitment(draft.policy),
    );
    expect(prepared.agreement.agreementCommitment).toBe(
      computeAgreementCommitment(draft),
    );
  });

  it.each([
    { ...draft, buyer: seller },
    { ...draft, arbitrator: ZeroAddress },
    { ...draft, requiredAmount: "0" },
  ])("rejects invalid participant and amount drafts", async (invalid) => {
    const service = new AgreementCreationService(
      new InMemoryAgreementRepository(),
      new FakeDeployer(),
    );
    await expect(service.prepare(invalid)).rejects.toThrow();
  });

  it("deploys only after confirmation and captures confirmed chain identifiers", async () => {
    const repository = new InMemoryAgreementRepository();
    const deployer = new FakeDeployer();
    const service = new AgreementCreationService(repository, deployer);
    const prepared = await service.prepare(draft);
    expect(deployer.input).toBeUndefined();
    const deployed = await service.confirmAndDeploy(prepared.agreement.id);
    expect(deployed.deploymentStatus).toBe("DEPLOYED");
    expect(deployed.escrowAddress).toBe(registry);
    expect(deployed.deploymentTransactionHash).toBe(id("deployment"));
    expect(deployed.deploymentBlockNumber).toBe("42");
    expect(deployer.input?.evidencePolicyCommitment).toBe(
      prepared.agreement.evidencePolicyCommitment,
    );
  });

  it("records a sanitized failure without fabricating a deployment", async () => {
    const repository = new InMemoryAgreementRepository();
    const deployer = new FakeDeployer();
    deployer.fail = true;
    const service = new AgreementCreationService(repository, deployer);
    const prepared = await service.prepare(draft);
    const failed = await service.confirmAndDeploy(prepared.agreement.id);
    expect(failed.deploymentStatus).toBe("FAILED");
    expect(failed.escrowAddress).toBeUndefined();
    expect(failed.deploymentError).toBe("Escrow deployment failed");
  });
});
