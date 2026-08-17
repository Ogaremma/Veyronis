import type { VerifiedEvidenceClaim } from "@veyronis/shared";
import { Contract, type ContractRunner, type Signer, getAddress } from "ethers";
import type {
  EscrowContextReader,
  EscrowDisputeContext,
  EvidenceClaimRegistryGateway,
  RegistrySubmission,
} from "./verifier-types.js";

const escrowAbi = [
  "function agreementCommitment() view returns (bytes32)",
  "function evidencePolicyCommitment() view returns (bytes32)",
  "function activeEvidenceCommitment() view returns (bytes32)",
  "function buyer() view returns (address)",
  "function seller() view returns (address)",
  "function state() view returns (uint8)",
] as const;

const registryAbi = [
  "function consumedClaims(bytes32) view returns (bool)",
  "function sourceEvidenceEscrow(bytes32) view returns (address)",
  "function submitVerifiedClaim((address escrow,bytes32 agreementCommitment,bytes32 evidencePolicyCommitment,bytes32 evidenceCommitment,bytes32 evidenceType,uint64 sourceChainKey,bytes32 sourceTransactionHash,address subject)) returns (bytes32 claimId)",
  "event VerifiedClaimAccepted(bytes32 indexed claimId,address indexed escrow,bytes32 indexed evidenceCommitment,bytes32 sourceEvidenceKey)",
] as const;

export class EthersEscrowContextReader implements EscrowContextReader {
  constructor(private readonly runner: ContractRunner) {}

  async readDisputeContext(escrowAddress: string): Promise<EscrowDisputeContext> {
    const address = getAddress(escrowAddress);
    const escrow = new Contract(address, escrowAbi, this.runner);
    const [agreementCommitment, evidencePolicyCommitment, activeEvidenceCommitment, buyer, seller, state] = await Promise.all([
      escrow.getFunction("agreementCommitment").staticCall() as Promise<string>,
      escrow.getFunction("evidencePolicyCommitment").staticCall() as Promise<string>,
      escrow.getFunction("activeEvidenceCommitment").staticCall() as Promise<string>,
      escrow.getFunction("buyer").staticCall() as Promise<string>,
      escrow.getFunction("seller").staticCall() as Promise<string>,
      escrow.getFunction("state").staticCall() as Promise<bigint>,
    ]);
    return {
      escrowAddress: address,
      agreementCommitment,
      evidencePolicyCommitment,
      activeEvidenceCommitment,
      buyer,
      seller,
      state: Number(state),
    };
  }
}

export class EthersEvidenceClaimRegistryGateway implements EvidenceClaimRegistryGateway {
  private readonly registry: Contract;

  constructor(registryAddress: string, signer: Signer) {
    this.registry = new Contract(getAddress(registryAddress), registryAbi, signer);
  }

  async isClaimConsumed(claimId: string): Promise<boolean> {
    return (await this.registry.getFunction("consumedClaims").staticCall(claimId)) as boolean;
  }

  async sourceEvidenceEscrow(sourceEvidenceKey: string): Promise<string> {
    return (await this.registry
      .getFunction("sourceEvidenceEscrow")
      .staticCall(sourceEvidenceKey)) as string;
  }

  async submitVerifiedClaim(claim: VerifiedEvidenceClaim): Promise<RegistrySubmission> {
    const submit = this.registry.getFunction("submitVerifiedClaim");
    const expectedClaimId = (await submit.staticCall(claim)) as string;
    const transaction = await submit(claim);
    const receipt = await transaction.wait();
    if (!receipt) throw new Error("Registry transaction was not mined");
    return { claimId: expectedClaimId, transactionHash: transaction.hash };
  }
}
