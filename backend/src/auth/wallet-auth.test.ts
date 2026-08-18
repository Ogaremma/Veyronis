import { Wallet } from "ethers";
import { describe, expect, it } from "vitest";
import { WalletAuthService } from "./wallet-auth.js";

describe("WalletAuthService", () => {
  it("verifies a one-time wallet signature and issues an expiring session", async () => {
    const wallet = Wallet.createRandom();
    const auth = new WalletAuthService("a sufficiently long test secret");
    const challenge = auth.createChallenge(wallet.address);
    const signature = await wallet.signMessage(challenge.message);
    const token = auth.verify(wallet.address, signature);
    expect(auth.readSession(token)?.address).toBe(wallet.address);
    expect(() => auth.verify(wallet.address, signature)).toThrow();
  });
  it("rejects a signature from another wallet", async () => {
    const wallet = Wallet.createRandom();
    const auth = new WalletAuthService("a sufficiently long test secret");
    const challenge = auth.createChallenge(wallet.address);
    expect(() => auth.verify(wallet.address, "0x" + "00".repeat(65))).toThrow();
    expect(challenge.message).toContain(
      "does not authorize a blockchain transaction",
    );
  });
});
