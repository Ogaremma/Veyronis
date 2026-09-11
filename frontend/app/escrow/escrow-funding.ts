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

const escrowFundingAbi = ["function deposit() payable"] as const;

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
  reconcile: () => Promise<void>;
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

  let latestReceipt: TransactionReceiptInfo = { status: "IDLE" };
  await executeWalletTransaction(
    async () => contract.getFunction("deposit")({
      value: BigInt(requiredAmount),
    }),
    input.reconcile,
    (receipt) => {
      latestReceipt = receipt;
      input.onTransaction?.(receipt);
    },
    (hash) => explorerTransactionUrl(network.chainId, hash),
  );
  return latestReceipt;
}
