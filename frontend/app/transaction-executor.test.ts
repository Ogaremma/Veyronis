import { describe, expect, it, vi } from "vitest";
import type { TransactionReceiptInfo } from "@veyronis/shared";
import { executeWalletTransaction } from "./transaction-executor";

describe("wallet transaction lifecycle", () => {
  it("requires a receipt and reconciliation before completion", async () => {
    const updates: TransactionReceiptInfo[] = [];
    const reconcile = vi.fn(async () => {});
    await executeWalletTransaction(async () => ({ hash: "0xabc", wait: async () => ({ status: 1, blockNumber: 9, confirmations: async () => 1 }) }), reconcile, (value) => updates.push(value));
    expect(updates.map((value) => value.status)).toEqual(["AWAITING_WALLET_SIGNATURE", "TRANSACTION_SUBMITTED", "CONFIRMING", "CONFIRMED", "RECONCILING", "COMPLETE"]);
    expect(reconcile).toHaveBeenCalledOnce();
    expect(updates.at(-1)).toMatchObject({ blockNumber: "9", confirmations: 1 });
  });

  it("distinguishes rejection, revert, and reconciliation failure", async () => {
    const rejected: TransactionReceiptInfo[] = [];
    await executeWalletTransaction(async () => { throw Object.assign(new Error("rejected"), { code: 4001 }); }, async () => {}, (value) => rejected.push(value));
    expect(rejected.at(-1)?.status).toBe("USER_REJECTED");
    const reverted: TransactionReceiptInfo[] = [];
    await executeWalletTransaction(async () => ({ hash: "0xdef", wait: async () => ({ status: 0, blockNumber: 10, confirmations: async () => 1 }) }), async () => {}, (value) => reverted.push(value));
    expect(reverted.at(-1)?.status).toBe("TRANSACTION_REVERTED");
    const failed: TransactionReceiptInfo[] = [];
    await executeWalletTransaction(async () => ({ hash: "0x123", wait: async () => ({ status: 1, blockNumber: 11, confirmations: async () => 1 }) }), async () => { throw new Error("refresh failed"); }, (value) => failed.push(value));
    expect(failed.at(-1)?.status).toBe("RECONCILIATION_FAILED");
  });
});
