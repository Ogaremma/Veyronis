import {
  ContractFactory,
  getAddress,
  type ContractRunner,
  type InterfaceAbi,
} from "ethers";
import type { AgreementDraft } from "@veyronis/shared";

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
    const contract = await factory.deploy(
      getAddress(input.buyer),
      getAddress(input.seller),
      getAddress(input.arbitrator),
      input.agreementCommitment,
      input.evidencePolicyCommitment,
      BigInt(input.requiredAmount),
      getAddress(input.evidenceRegistry),
    );
    const transaction = contract.deploymentTransaction();
    if (!transaction) throw new Error("Deployment transaction was not created");
    const receipt = await transaction.wait();
    if (!receipt || receipt.status !== 1)
      throw new Error("Escrow deployment was not confirmed");
    return {
      escrowAddress: getAddress(await contract.getAddress()),
      transactionHash: transaction.hash,
      blockNumber: String(receipt.blockNumber),
    };
  }
}
