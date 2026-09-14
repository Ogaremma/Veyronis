import type { VerifiedEvidenceClaim } from "@veyronis/shared";
import {
  Contract,
  type ContractRunner,
  type Log,
  type LogDescription,
  type Signer,
  type TransactionReceipt,
  type TransactionResponse,
  getAddress,
} from "ethers";
import {
  computeClaimId,
  computeSourceEvidenceKey,
} from "./attestcoin-verifier.js";
import type {
  EscrowContextReader,
  EscrowDisputeContext,
  EscrowSettlementContext,
  EvidenceClaimRegistryGateway,
  RegistrySubmission,
} from "./verifier-types.js";

const escrowAbi = [
  "function agreementCommitment() view returns (bytes32)",
  "function evidencePolicyCommitment() view returns (bytes32)",
  "function activeEvidenceCommitment() view returns (bytes32)",
  "function directConditionSettlement() view returns (bool)",
  "function buyer() view returns (address)",
  "function seller() view returns (address)",
  "function state() view returns (uint8)",
  "function verifiedClaimId() view returns (bytes32)",
  "function withdrawals(address) view returns (uint256)",
] as const;

const registryAbi = [
  "function authorizedVerifier() view returns (address)",
  "function consumedClaims(bytes32) view returns (bool)",
  "function sourceEvidenceEscrow(bytes32) view returns (address)",
  "function submitVerifiedClaim((address escrow,bytes32 agreementCommitment,bytes32 evidencePolicyCommitment,bytes32 evidenceCommitment,bytes32 evidenceType,uint64 sourceChainKey,bytes32 sourceTransactionHash,address subject)) returns (bytes32 claimId)",
  "function submitVerifiedConditionClaim((address escrow,bytes32 agreementCommitment,bytes32 evidencePolicyCommitment,bytes32 evidenceCommitment,bytes32 evidenceType,uint64 sourceChainKey,bytes32 sourceTransactionHash,address subject)) returns (bytes32 claimId)",
  "function submitVerifiedPrerequisiteClaim((address escrow,bytes32 agreementCommitment,bytes32 evidencePolicyCommitment,bytes32 evidenceCommitment,bytes32 evidenceType,uint64 sourceChainKey,bytes32 sourceTransactionHash,address subject)) returns (bytes32 claimId)",
  "event VerifiedClaimAccepted(bytes32 indexed claimId,address indexed escrow,bytes32 indexed evidenceCommitment,bytes32 sourceEvidenceKey)",
] as const;

export class EthersEscrowContextReader implements EscrowContextReader {
  constructor(private readonly runner: ContractRunner) {}

  async readDisputeContext(
    escrowAddress: string,
  ): Promise<EscrowDisputeContext> {
    const address = getAddress(escrowAddress);
    const escrow = new Contract(address, escrowAbi, this.runner);
    const [
      agreementCommitment,
      evidencePolicyCommitment,
      activeEvidenceCommitment,
      directConditionSettlement,
      buyer,
      seller,
      state,
    ] = await Promise.all([
      escrow.getFunction("agreementCommitment").staticCall() as Promise<string>,
      escrow
        .getFunction("evidencePolicyCommitment")
        .staticCall() as Promise<string>,
      escrow
        .getFunction("activeEvidenceCommitment")
        .staticCall() as Promise<string>,
      escrow
        .getFunction("directConditionSettlement")
        .staticCall() as Promise<boolean>,
      escrow.getFunction("buyer").staticCall() as Promise<string>,
      escrow.getFunction("seller").staticCall() as Promise<string>,
      escrow.getFunction("state").staticCall() as Promise<bigint>,
    ]);
    return {
      escrowAddress: address,
      agreementCommitment,
      evidencePolicyCommitment,
      activeEvidenceCommitment,
      directConditionSettlement,
      buyer,
      seller,
      state: Number(state),
    };
  }

  async readVerifiedClaimId(escrowAddress: string): Promise<string> {
    const escrow = new Contract(
      getAddress(escrowAddress),
      escrowAbi,
      this.runner,
    );
    return (await escrow.getFunction("verifiedClaimId").staticCall()) as string;
  }

  async readSettlementContext(
    escrowAddress: string,
  ): Promise<EscrowSettlementContext> {
    const escrow = new Contract(
      getAddress(escrowAddress),
      escrowAbi,
      this.runner,
    );
    const seller = (await escrow.getFunction("seller").staticCall()) as string;
    const [state, verifiedClaimId, activeEvidenceCommitment, sellerWithdrawal] =
      await Promise.all([
        escrow.getFunction("state").staticCall() as Promise<bigint>,
        escrow.getFunction("verifiedClaimId").staticCall() as Promise<string>,
        escrow
          .getFunction("activeEvidenceCommitment")
          .staticCall() as Promise<string>,
        escrow.getFunction("withdrawals")(seller) as Promise<bigint>,
      ]);
    return {
      state: Number(state),
      verifiedClaimId,
      activeEvidenceCommitment,
      sellerWithdrawal,
    };
  }
}

export class EthersEvidenceClaimRegistryGateway implements EvidenceClaimRegistryGateway {
  private readonly registry: Contract;
  private readonly signer: Signer;
  private submissionTail: Promise<void> = Promise.resolve();
  private readonly claimSubmissions = new Map<string, PendingClaimSubmission>();

  constructor(registryAddress: string, signer: Signer) {
    this.signer = signer;
    this.registry = new Contract(
      getAddress(registryAddress),
      registryAbi,
      signer,
    );
  }

  async authorizedVerifier(): Promise<string> {
    return (await this.registry
      .getFunction("authorizedVerifier")
      .staticCall()) as string;
  }

  async isClaimConsumed(claimId: string): Promise<boolean> {
    return (await this.registry
      .getFunction("consumedClaims")
      .staticCall(claimId)) as boolean;
  }

  async sourceEvidenceEscrow(sourceEvidenceKey: string): Promise<string> {
    return (await this.registry
      .getFunction("sourceEvidenceEscrow")
      .staticCall(sourceEvidenceKey)) as string;
  }

  async submitVerifiedClaim(
    claim: VerifiedEvidenceClaim,
  ): Promise<RegistrySubmission> {
    return this.submitClaim(claim, "submitVerifiedClaim");
  }

  async submitVerifiedConditionClaim(
    claim: VerifiedEvidenceClaim,
  ): Promise<RegistrySubmission> {
    return this.submitClaim(claim, "submitVerifiedConditionClaim");
  }

  async submitVerifiedPrerequisiteClaim(
    claim: VerifiedEvidenceClaim,
  ): Promise<RegistrySubmission> {
    return this.submitClaim(claim, "submitVerifiedPrerequisiteClaim");
  }

  private async submitClaim(
    claim: VerifiedEvidenceClaim,
    functionName:
      | "submitVerifiedClaim"
      | "submitVerifiedConditionClaim"
      | "submitVerifiedPrerequisiteClaim",
  ): Promise<RegistrySubmission> {
    const claimId = computeClaimId(claim);
    let pending = this.claimSubmissions.get(claimId);
    if (!pending) {
      pending = { claim, functionName };
      this.claimSubmissions.set(claimId, pending);
    } else if (pending.functionName !== functionName) {
      throw new Error("Claim is already queued for another submission mode");
    }
    if (pending.current) return pending.current;

    const current = this.serializeSubmission(() =>
      this.processClaimSubmission(claimId, pending!),
    );
    pending.current = current;
    void current
      .finally(() => {
        delete pending!.current;
      })
      .catch(() => undefined);
    return current;
  }

  private serializeSubmission<T>(work: () => Promise<T>): Promise<T> {
    const result = this.submissionTail.then(work, work);
    this.submissionTail = result.then(
      () => undefined,
      () => undefined,
    );
    return result;
  }

  private async processClaimSubmission(
    claimId: string,
    pending: PendingClaimSubmission,
  ): Promise<RegistrySubmission> {
    const { claim, functionName } = pending;
    const authorizedVerifier = await this.authorizedVerifier();
    const signerAddress = await this.signer.getAddress();
    if (getAddress(signerAddress) !== getAddress(authorizedVerifier))
      throw new Error("Registry signer is not the authorized verifier");

    const submit = this.registry.getFunction(functionName);
    const expectedClaimId = (await submit.staticCall(claim)) as string;
    if (expectedClaimId.toLowerCase() !== claimId.toLowerCase())
      throw new Error(
        "Registry claim ID did not match the deterministic claim ID",
      );
    if (!pending.transaction) {
      pending.transaction = (await submit(claim)) as TransactionResponse;
    }
    const transaction = pending.transaction;
    const receipt = await this.waitForReceipt(transaction);
    if (!receipt || receipt.status !== 1)
      throw new Error("Registry transaction was not mined successfully");

    const acceptedEvent = (receipt.logs as Log[])
      .map((log: Log) => {
        try {
          return this.registry.interface.parseLog(log);
        } catch {
          return undefined;
        }
      })
      .find(
        (parsed: LogDescription | null | undefined) =>
          parsed?.name === "VerifiedClaimAccepted",
      );
    if (!acceptedEvent)
      throw new Error("Registry acceptance event was not emitted");

    const sourceEvidenceKey = computeSourceEvidenceKey(claim);
    if (
      String(acceptedEvent.args[0]) !== expectedClaimId ||
      getAddress(String(acceptedEvent.args[1])) !== getAddress(claim.escrow) ||
      String(acceptedEvent.args[2]) !== claim.evidenceCommitment ||
      String(acceptedEvent.args[3]) !== sourceEvidenceKey
    )
      throw new Error(
        "Registry acceptance event did not match the submitted claim",
      );

    const [consumed, boundEscrow] = await Promise.all([
      this.isClaimConsumed(expectedClaimId),
      this.sourceEvidenceEscrow(sourceEvidenceKey),
    ]);
    if (!consumed || getAddress(boundEscrow) !== getAddress(claim.escrow))
      throw new Error(
        "Registry post-submission state did not match the accepted claim",
      );

    this.claimSubmissions.delete(claimId);
    return { claimId: expectedClaimId, transactionHash: transaction.hash };
  }

  private async waitForReceipt(
    transaction: TransactionResponse,
  ): Promise<TransactionReceipt | null> {
    try {
      return await transaction.wait();
    } catch (error) {
      if (!this.signer.provider) throw error;
      const receipt = await this.signer.provider.getTransactionReceipt(
        transaction.hash,
      );
      if (receipt) return receipt;
      throw new Error(
        `Registry transaction ${transaction.hash} is pending; retry will resume this transaction`,
        { cause: error },
      );
    }
  }
}

interface PendingClaimSubmission {
  claim: VerifiedEvidenceClaim;
  functionName:
    | "submitVerifiedClaim"
    | "submitVerifiedConditionClaim"
    | "submitVerifiedPrerequisiteClaim";
  transaction?: TransactionResponse;
  current?: Promise<RegistrySubmission>;
}
