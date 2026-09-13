import {
  ContractFactory,
  getAddress,
  type ContractRunner,
  type InterfaceAbi,
} from "ethers";
import type { AgreementDraft } from "@veyronis/shared";
import { agreementLifecycleMode } from "@veyronis/shared";

export interface EscrowDeploymentResult {
  escrowAddress: string;
  transactionHash: string;
  blockNumber?: string;
}

export interface EscrowDeploymentGateway {
  deploy(
    input: AgreementDraft & {
      agreementCommitment: string;
      evidencePolicyCommitment: string;
    },
  ): Promise<EscrowDeploymentResult>;
}

export class EthersEscrowDeployer implements EscrowDeploymentGateway {
  constructor(
    private readonly runner: ContractRunner,
    private readonly abi: InterfaceAbi,
    private readonly bytecode: string,
  ) {}

  async deploy(
    input: AgreementDraft & {
      agreementCommitment: string;
      evidencePolicyCommitment: string;
    },
  ): Promise<EscrowDeploymentResult> {
    const factory = new ContractFactory(this.abi, this.bytecode, this.runner);
    const directConditionSettlement =
      agreementLifecycleMode(input) === "blockchain_condition_only";
    const contract = await factory.deploy(
      getAddress(input.buyer),
      getAddress(input.seller),
      getAddress(input.arbitrator),
      input.agreementCommitment,
      input.evidencePolicyCommitment,
      BigInt(input.requiredAmount),
      getAddress(input.evidenceRegistry),
      directConditionSettlement,
    );
    const transaction = contract.deploymentTransaction();
    if (!transaction) throw new Error("Deployment transaction was not created");
    const receipt = await transaction.wait();
    if (!receipt || receipt.status !== 1)
      throw new Error("Escrow deployment was not confirmed");
    const [
      buyer,
      seller,
      arbitrator,
      agreement,
      policy,
      amount,
      registry,
      deployedDirectSettlement,
    ] = await Promise.all([
      contract.getFunction("buyer")(),
      contract.getFunction("seller")(),
      contract.getFunction("arbitrator")(),
      contract.getFunction("agreementCommitment")(),
      contract.getFunction("evidencePolicyCommitment")(),
      contract.getFunction("requiredAmount")(),
      contract.getFunction("evidenceRegistry")(),
      contract.getFunction("directConditionSettlement")(),
    ]);
    if (
      getAddress(String(buyer)) !== getAddress(input.buyer) ||
      getAddress(String(seller)) !== getAddress(input.seller) ||
      getAddress(String(arbitrator)) !== getAddress(input.arbitrator) ||
      String(agreement).toLowerCase() !==
        input.agreementCommitment.toLowerCase() ||
      String(policy).toLowerCase() !==
        input.evidencePolicyCommitment.toLowerCase() ||
      BigInt(amount) !== BigInt(input.requiredAmount) ||
      getAddress(String(registry)) !== getAddress(input.evidenceRegistry) ||
      Boolean(deployedDirectSettlement) !== directConditionSettlement
    ) {
      throw new Error("Deployed escrow immutable metadata mismatch");
    }
    return {
      escrowAddress: getAddress(await contract.getAddress()),
      transactionHash: transaction.hash,
      blockNumber: String(receipt.blockNumber),
    };
  }
}
