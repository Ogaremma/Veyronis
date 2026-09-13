import { BrowserProvider, Contract } from "ethers";
import type {
  AgreementDetails,
  TransactionReceiptInfo,
} from "@veyronis/shared";
import { explorerTransactionUrl } from "../network-config";
import {
  requiredTransactionChainId,
  transactionNetworkError,
} from "../transaction-network-guard";
import { executeWalletTransaction } from "../transaction-executor";

const escrowFundingAbi = [
  "function state() view returns (uint8)",
  "function depositedAmount() view returns (uint256)",
  "function requiredAmount() view returns (uint256)",
  "function deposit() payable",
] as const;

export interface EscrowFundingChecks {
  walletAddress: string | undefined;
  walletChainId: number | undefined;
  details: Pick<AgreementDetails, "role" | "chain"> | undefined;
  balance: bigint | undefined;
}

export function validateEscrowFunding(checks: EscrowFundingChecks): string | undefined {
  const chain = checks.details?.chain;
  if (!chain?.escrowAddress) return "A deployed escrow address is required before funding.";

  const networkError = transactionNetworkError(
    checks.walletChainId,
    requiredTransactionChainId(),
  );
  if (networkError) return networkError;

  if (
    !checks.walletAddress ||
    checks.details?.role !== "buyer" ||
    checks.walletAddress.toLowerCase() !== chain.buyer.toLowerCase()
  ) {
    return "Only the agreement buyer can fund this escrow.";
  }

  if (chain.state !== "AwaitingPayment") {
    return `Funding is unavailable while the escrow is ${chain.state}.`;
  }

  let requiredAmount: bigint;
  try {
    requiredAmount = BigInt(chain.requiredAmount);
  } catch {
    return "The escrow required amount is invalid.";
  }
  if (requiredAmount <= 0n) return "The escrow required amount is invalid.";
  if (checks.balance !== undefined && checks.balance < requiredAmount) {
    return "Wallet balance is insufficient to fund this escrow.";
  }
  return undefined;
}

export async function fundEscrow(input: {
  getProvider: () => Promise<unknown>;
  walletAddress: string | undefined;
  walletChainId: number | undefined;
  details: AgreementDetails;
  reconcile: () => Promise<AgreementDetails | void>;
  onTransaction?: (receipt: TransactionReceiptInfo) => void;
}): Promise<TransactionReceiptInfo> {
  const provider = new BrowserProvider(await input.getProvider() as never);
  const signer = await provider.getSigner();
  const signerAddress = await signer.getAddress();
  const balance = await provider.getBalance(signerAddress);
  const validationError = validateEscrowFunding({
    walletAddress: signerAddress,
    walletChainId: input.walletChainId,
    details: input.details,
    balance,
  });
  if (validationError) throw new Error(validationError);

  const network = await provider.getNetwork();
  const providerNetworkError = transactionNetworkError(
    Number(network.chainId),
    requiredTransactionChainId(),
  );
  if (providerNetworkError) throw new Error(providerNetworkError);

  const contract = new Contract(
    input.details.chain!.escrowAddress,
    escrowFundingAbi,
    signer,
  );
  const requiredAmount = BigInt(input.details.chain!.requiredAmount);
  const preFundingState = await readFundingState(contract);
  if (preFundingState.state !== 0) {
    throw new Error("Funding is unavailable because the escrow is not awaiting payment.");
  }
  if (preFundingState.requiredAmount !== requiredAmount) {
    throw new Error("The escrow required amount does not match agreement metadata.");
  }
  if (preFundingState.depositedAmount !== 0n) {
    throw new Error("The escrow is not awaiting a new deposit.");
  }

  let latestReceipt: TransactionReceiptInfo = { status: "IDLE" };
  await executeWalletTransaction(
    async () => contract.getFunction("deposit")({
      value: BigInt(requiredAmount),
    }),
    async () => {
      const fundedState = await readFundingState(contract);
      if (
        fundedState.state !== 1 ||
        fundedState.depositedAmount !== requiredAmount
      ) {
        return pendingReconciliation();
      }

      let reconciled: AgreementDetails | void;
      try {
        reconciled = await input.reconcile();
      } catch {
        return pendingReconciliation();
      }
      if (
        !reconciled?.chain ||
        reconciled.chain.state !== "AwaitingDelivery" ||
        reconciled.chain.depositedAmount !== input.details.chain!.requiredAmount
      ) {
        return pendingReconciliation();
      }
      return { status: "CONFIRMED" };
    },
    (receipt) => {
      latestReceipt = receipt;
      input.onTransaction?.(receipt);
    },
    (hash) => explorerTransactionUrl(network.chainId, hash),
  );
  return latestReceipt;
}

async function readFundingState(contract: Contract) {
  const [state, depositedAmount, requiredAmount] = await Promise.all([
    contract.getFunction("state")(),
    contract.getFunction("depositedAmount")(),
    contract.getFunction("requiredAmount")(),
  ]);
  return {
    state: Number(state),
    depositedAmount: BigInt(depositedAmount),
    requiredAmount: BigInt(requiredAmount),
  };
}

function pendingReconciliation() {
  return {
    status: "PENDING" as const,
    message: "Funding submitted, waiting for chain reconciliation.",
  };
}
