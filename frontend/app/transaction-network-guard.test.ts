import { describe, expect, it } from "vitest";
import {
  LOCAL_TRANSACTION_CHAIN_ID,
  PRODUCTION_TRANSACTION_CHAIN_ID,
  requiredTransactionChainId,
  transactionNetworkError,
} from "./transaction-network-guard";

describe("transaction network guard", () => {
  it("requires Sepolia unless local development is explicitly configured", () => {
    expect(requiredTransactionChainId("", "")).toBe(PRODUCTION_TRANSACTION_CHAIN_ID);
    expect(requiredTransactionChainId("31337", "")).toBe(PRODUCTION_TRANSACTION_CHAIN_ID);
    expect(requiredTransactionChainId("31337", "false")).toBe(PRODUCTION_TRANSACTION_CHAIN_ID);
    expect(requiredTransactionChainId("31337", "true")).toBe(LOCAL_TRANSACTION_CHAIN_ID);
  });

  it("allows only the required chain before an escrow transaction", () => {
    expect(transactionNetworkError(11155111, PRODUCTION_TRANSACTION_CHAIN_ID)).toBeUndefined();
    expect(transactionNetworkError(31337, LOCAL_TRANSACTION_CHAIN_ID)).toBeUndefined();
  });

  it("blocks wrong and undefined wallet chains", () => {
    expect(transactionNetworkError(31337, PRODUCTION_TRANSACTION_CHAIN_ID)).toBe(
      "Wrong network. Switch your wallet to Sepolia to continue.",
    );
    expect(transactionNetworkError(undefined, PRODUCTION_TRANSACTION_CHAIN_ID)).toBe(
      "Wrong network. Switch your wallet to Sepolia to continue.",
    );
    expect(transactionNetworkError(11155111, LOCAL_TRANSACTION_CHAIN_ID)).toBe(
      "Wrong network. Switch your wallet to Anvil Local to continue.",
    );
  });
});
