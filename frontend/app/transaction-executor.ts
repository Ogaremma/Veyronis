import type { TransactionReceiptInfo, TransactionStatus } from "@veyronis/shared";

export interface SubmittedTransaction {
  hash: string;
  wait(confirmations?: number): Promise<{
    status: number | null;
    blockNumber: number;
    confirmations(): Promise<number>;
  } | null>;
}

export async function executeWalletTransaction(
  submit: () => Promise<SubmittedTransaction>,
  reconcile: () => Promise<void>,
  update: (receipt: TransactionReceiptInfo) => void,
  explorer?: (hash: string) => string | undefined,
): Promise<void> {
  update({ status: "AWAITING_WALLET_SIGNATURE" });
  let transaction: SubmittedTransaction;
  try {
    transaction = await submit();
  } catch (error) {
    update({ status: classifySubmissionError(error), error: errorMessage(error) });
    return;
  }
  const explorerUrl = explorer?.(transaction.hash);
  const base = {
    hash: transaction.hash,
    ...(explorerUrl ? { explorerUrl } : {}),
  };
  update({ ...base, status: "TRANSACTION_SUBMITTED" });
  update({ ...base, status: "CONFIRMING" });
  try {
    const receipt = await transaction.wait(1);
    if (!receipt || receipt.status !== 1) {
      update({ ...base, status: "TRANSACTION_REVERTED", error: "The transaction reverted on-chain." });
      return;
    }
    const confirmed = {
      ...base,
      blockNumber: String(receipt.blockNumber),
      confirmations: await receipt.confirmations(),
    };
    update({ ...confirmed, status: "CONFIRMED" });
    update({ ...confirmed, status: "RECONCILING" });
    try {
      await reconcile();
      update({ ...confirmed, status: "COMPLETE" });
    } catch (error) {
      update({ ...confirmed, status: "RECONCILIATION_FAILED", error: errorMessage(error) });
    }
  } catch (error) {
    update({ ...base, status: "RPC_ERROR", error: errorMessage(error) });
  }
}

function classifySubmissionError(error: unknown): TransactionStatus {
  const candidate = error as { code?: number | string };
  return candidate?.code === 4001 || candidate?.code === "ACTION_REJECTED"
    ? "USER_REJECTED"
    : "RPC_ERROR";
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Wallet transaction failed.";
}
