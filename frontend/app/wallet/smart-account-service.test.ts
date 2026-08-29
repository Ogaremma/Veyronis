import { describe, expect, it } from "vitest";
import { readAaConfig, buildNoopCall, buildUserOperation, estimateUserOperation, submitAndWait, ENTRYPOINT_V08, type AaLifecycleClient } from "./smart-account-service";

const operation = { sender: "0x0000000000000000000000000000000000000002", nonce: 0n, callData: "0x", callGasLimit: 1n, verificationGasLimit: 1n, preVerificationGas: 1n, maxFeePerGas: 1n, maxPriorityFeePerGas: 1n, signature: "0x" } as never;
function client(overrides: Partial<AaLifecycleClient> = {}): AaLifecycleClient { return { prepareUserOperation: async () => operation, estimateUserOperationGas: async () => ({ callGasLimit: 1n }), sendUserOperation: async () => `0x${"11".repeat(32)}`, waitForUserOperationReceipt: async () => ({ success: true, receipt: { transactionHash: `0x${"22".repeat(32)}`, status: "success" } }), ...overrides }; }

describe("smart-account configuration", () => {
  it("supports Anvil and Sepolia without secrets", () => {
    expect(readAaConfig({ NEXT_PUBLIC_AA_NETWORK: "anvil", NEXT_PUBLIC_ANVIL_RPC_URL: "http://127.0.0.1:8545" }).chainId).toBe(31337);
    expect(readAaConfig({ NEXT_PUBLIC_AA_NETWORK: "sepolia", NEXT_PUBLIC_SEPOLIA_RPC_URL: "https://example.invalid" }).chainId).toBe(11155111);
  });
  it("fails closed when RPC is missing", () => { expect(() => readAaConfig({ NEXT_PUBLIC_AA_NETWORK: "sepolia" })).toThrow("Missing RPC URL"); });
  it("builds a harmless no-op call and uses EntryPoint v0.8", () => { expect(buildNoopCall("0x0000000000000000000000000000000000000001")).toEqual({ to: "0x0000000000000000000000000000000000000001", value: 0n, data: "0x" }); expect(ENTRYPOINT_V08).toBe("0x4337084D9E255Ff0702461CF8895CE9E3b5Ff108"); });
});

describe("UserOperation lifecycle", () => {
  it("constructs, estimates, submits, and returns the real transaction hash", async () => { const c = client(); const built = await buildUserOperation(c, "0x0000000000000000000000000000000000000002"); expect(await estimateUserOperation(c, built)).toEqual({ callGasLimit: 1n }); expect((await submitAndWait(c, built)).transactionHash).toBe(`0x${"22".repeat(32)}`); });
  it("propagates rejected owner signatures", async () => { await expect(buildUserOperation(client({ prepareUserOperation: async () => { throw Object.assign(new Error("rejected"), { code: "ACTION_REJECTED" }); } }), "0x0000000000000000000000000000000000000002")).rejects.toMatchObject({ code: "ACTION_REJECTED" }); });
  it("propagates bundler errors", async () => { await expect(submitAndWait(client({ sendUserOperation: async () => { throw new Error("bundler unavailable"); } }), operation)).rejects.toThrow("bundler unavailable"); });
  it("does not report success for reverted UserOperations", async () => { await expect(submitAndWait(client({ waitForUserOperationReceipt: async () => ({ success: false, receipt: { transactionHash: `0x${"33".repeat(32)}`, status: "reverted" } }) }), operation)).rejects.toThrow("reverted on-chain"); });
});
