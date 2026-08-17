import { Interface, ZeroAddress, id, zeroPadValue } from "ethers";
import { describe, expect, it } from "vitest";
import type { EvidencePolicy } from "@veyronis/shared";
import { SourceTransactionPolicyEvaluator } from "./source-transaction-interpreter.js";
import type { VerifiedSourceTransaction } from "./verifier-types.js";

const buyer = "0x1000000000000000000000000000000000000001";
const seller = "0x2000000000000000000000000000000000000002";
const token = "0x3000000000000000000000000000000000000003";
const other = "0x4000000000000000000000000000000000000004";
const evidenceType = id("SOURCE_PAYMENT");
const transferTopic = id("Transfer(address,address,uint256)");
const transferInterface = new Interface(["function transfer(address,uint256)"]);
const evaluator = new SourceTransactionPolicyEvaluator();

const nativePolicy: EvidencePolicy = {
  version: 1, evidenceType, sourceChainKey: 1, assetKind: "native",
  expectedSourceContract: ZeroAddress, expectedRecipient: seller, expectedAsset: ZeroAddress,
  expectedSender: buyer, amountRule: "exact", amount: "100", minSourceBlock: "90", maxSourceBlock: "110",
  calldataSelector: "0x00000000", requireTransferEvent: false,
};
const nativeTransaction: VerifiedSourceTransaction = {
  sourceChainKey: 1, sourceTransactionHash: id("tx"), sourceBlockNumber: 100, transactionIndex: 0,
  from: buyer, to: seller, chainId: "11155111", value: "100", data: "0x", receiptStatus: 1, logs: [],
};

function transferLog(address = token, from = buyer, to = seller, amount = 100n) {
  return {
    address,
    topics: [transferTopic, zeroPadValue(from, 32), zeroPadValue(to, 32)],
    data: zeroPadValue(`0x${amount.toString(16)}`, 32),
  };
}

function erc20Policy(overrides: Partial<EvidencePolicy> = {}): EvidencePolicy {
  return {
    ...nativePolicy,
    assetKind: "erc20",
    expectedSourceContract: token,
    expectedAsset: token,
    calldataSelector: "0xa9059cbb",
    requireTransferEvent: true,
    ...overrides,
  };
}

function erc20Transaction(overrides: Partial<VerifiedSourceTransaction> = {}): VerifiedSourceTransaction {
  return {
    ...nativeTransaction,
    to: token,
    value: "0",
    data: transferInterface.encodeFunctionData("transfer", [seller, 100n]),
    logs: [transferLog()],
    ...overrides,
  };
}

function code(result: ReturnType<SourceTransactionPolicyEvaluator["evaluate"]>) {
  return result.ok ? "OK" : result.code;
}

describe("SourceTransactionPolicyEvaluator", () => {
  it("accepts valid native and ERC-20 payment policies", () => {
    expect(evaluator.evaluate(nativeTransaction, nativePolicy).ok).toBe(true);
    expect(evaluator.evaluate(erc20Transaction(), erc20Policy()).ok).toBe(true);
  });

  it("supports minimum amounts and optional target/block bounds", () => {
    const policy = { ...nativePolicy, expectedSourceContract: ZeroAddress, amountRule: "minimum" as const, amount: "99", minSourceBlock: "0", maxSourceBlock: "0" };
    expect(evaluator.evaluate(nativeTransaction, policy).ok).toBe(true);
  });

  it.each([
    ["UNSUPPORTED_SOURCE_CHAIN", { sourceChainKey: 2 }],
    ["SUBJECT_MISMATCH", { from: other }],
    ["WRONG_SOURCE_CONTRACT", { to: other }],
    ["WRONG_RECIPIENT", { to: other }],
    ["WRONG_AMOUNT", { value: "99" }],
  ] as const)("rejects native policy failure %s", (expected, override) => {
    const policy = expected === "WRONG_SOURCE_CONTRACT" ? { ...nativePolicy, expectedSourceContract: seller } : nativePolicy;
    expect(code(evaluator.evaluate({ ...nativeTransaction, ...override }, policy))).toBe(expected);
  });

  it("rejects exact and minimum amount failures", () => {
    expect(code(evaluator.evaluate({ ...nativeTransaction, value: "101" }, nativePolicy))).toBe("WRONG_AMOUNT");
    expect(code(evaluator.evaluate({ ...nativeTransaction, value: "99" }, { ...nativePolicy, amountRule: "minimum" }))).toBe("WRONG_AMOUNT");
  });

  it("enforces both sides of the verified source-block window", () => {
    expect(code(evaluator.evaluate({ ...nativeTransaction, sourceBlockNumber: 89 }, nativePolicy))).toBe("STALE_EVIDENCE");
    expect(code(evaluator.evaluate({ ...nativeTransaction, sourceBlockNumber: 111 }, nativePolicy))).toBe("STALE_EVIDENCE");
    expect(code(evaluator.evaluate({ ...nativeTransaction, sourceBlockNumber: Number.NaN }, nativePolicy))).toBe("MISSING_VERIFIED_FRESHNESS_CONTEXT");
  });

  it("rejects wrong ERC-20 token, event origin, participants, amount, and malformed logs", () => {
    expect(code(evaluator.evaluate(erc20Transaction({ logs: [transferLog(other)] }), erc20Policy()))).toBe("WRONG_ASSET");
    expect(code(evaluator.evaluate(erc20Transaction({ logs: [transferLog(token, other)] }), erc20Policy()))).toBe("WRONG_EVENT");
    expect(code(evaluator.evaluate(erc20Transaction({ logs: [transferLog(token, buyer, other)] }), erc20Policy()))).toBe("WRONG_EVENT");
    expect(code(evaluator.evaluate(erc20Transaction({ logs: [transferLog(token, buyer, seller, 99n)] }), erc20Policy()))).toBe("WRONG_AMOUNT");
    expect(code(evaluator.evaluate(erc20Transaction({ logs: [{ address: token, topics: [transferTopic], data: "0x12" }] }), erc20Policy()))).toBe("WRONG_EVENT");
    expect(code(evaluator.evaluate(erc20Transaction({ logs: [] }), erc20Policy()))).toBe("WRONG_EVENT");
  });

  it("semantically decodes committed ERC-20 calldata", () => {
    expect(code(evaluator.evaluate(erc20Transaction({ data: transferInterface.encodeFunctionData("transfer", [other, 100n]) }), erc20Policy()))).toBe("WRONG_CALLDATA");
    expect(code(evaluator.evaluate(erc20Transaction({ data: "0xa9059cbb12" }), erc20Policy()))).toBe("WRONG_CALLDATA");
    expect(code(evaluator.evaluate(erc20Transaction({ data: "0x12345678" }), erc20Policy()))).toBe("WRONG_CALLDATA");
  });

  it("rejects internally ambiguous or unsupported policies", () => {
    expect(code(evaluator.evaluate(nativeTransaction, { ...nativePolicy, calldataSelector: "0x12345678" }))).toBe("INVALID_POLICY");
    expect(code(evaluator.evaluate(erc20Transaction(), { ...erc20Policy(), requireTransferEvent: false }))).toBe("INVALID_POLICY");
  });
});
