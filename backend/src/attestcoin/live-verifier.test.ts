import { JsonRpcProvider } from "ethers";
import { describe, expect, it } from "vitest";
import type { AppConfig } from "../config.js";
import { createLiveAttestcoinVerifier } from "./live-verifier.js";

const config: AppConfig = {
  CREDITCOIN_RPC_URL: "http://127.0.0.1:8545",
  ATTESTCOIN_PROOF_BUILDER_URL: "http://127.0.0.1:8080",
  SEPOLIA_CHAIN_KEY: 1,
  VEYRONIS_EVIDENCE_REGISTRY_ADDRESS: "0x3000000000000000000000000000000000000003",
  VEYRONIS_VERIFIER_PRIVATE_KEY: `0x${"11".repeat(32)}`,
};

function fakeProvider(chainId: bigint): JsonRpcProvider {
  return {
    getNetwork: async () => ({ chainId, name: "fake" }),
  } as unknown as JsonRpcProvider;
}

describe("createLiveAttestcoinVerifier", () => {
  it("uses Creditcoin only for proof verification and Sepolia for escrow and registry", async () => {
    const creditcoin = fakeProvider(102031n);
    const sepolia = fakeProvider(11155111n);
    const verifier = await createLiveAttestcoinVerifier(config, sepolia, creditcoin);

    expect((verifier as any).proofVerifier.creditcoinProvider).toBe(creditcoin);
    expect((verifier as any).escrowReader.runner).toBe(sepolia);
    expect((verifier as any).registry.registry.runner.provider).toBe(sepolia);
  });

  it("rejects a Creditcoin provider on the wrong chain", async () => {
    await expect(
      createLiveAttestcoinVerifier(
        config,
        fakeProvider(11155111n),
        fakeProvider(1n),
      ),
    ).rejects.toThrow("Creditcoin RPC is connected to another chain");
  });

  it("rejects a Sepolia provider on the wrong chain", async () => {
    await expect(
      createLiveAttestcoinVerifier(
        config,
        fakeProvider(31337n),
        fakeProvider(102031n),
      ),
    ).rejects.toThrow("Sepolia RPC is connected to another chain");
  });
});
