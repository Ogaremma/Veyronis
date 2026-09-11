import { afterEach, describe, expect, it, vi } from "vitest";
import { BrowserProvider, Contract } from "ethers";
import type { AgreementDetails } from "@veyronis/shared";
import { fundEscrow, validateEscrowFunding } from "./escrow-funding";

vi.mock("ethers", () => ({
  BrowserProvider: vi.fn(),
  Contract: vi.fn(),
}));

const buyer = "0x1000000000000000000000000000000000000001";
const seller = "0x2000000000000000000000000000000000000002";

function fundingDetails(state = "AwaitingPayment") {
  return {
    metadata: { id: "0x1", buyer, requiredAmount: "100" },
    role: "buyer",
    chain: {
      escrowAddress: "0x4000000000000000000000000000000000000004",
      buyer,
      seller,
      requiredAmount: "100",
      state,
    },
  } as AgreementDetails;
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});

describe("escrow funding guards", () => {
  it("blocks a wallet that is not the agreement buyer", () => {
    vi.stubEnv("NEXT_PUBLIC_CHAIN_ID", "11155111");
    vi.stubEnv("NEXT_PUBLIC_LOCAL_DEVELOPMENT", "false");

    expect(validateEscrowFunding({
      walletAddress: seller,
      walletChainId: 11155111,
      details: fundingDetails(),
      balance: 200n,
    })).toBe("Only the agreement buyer can fund this escrow.");
  });

  it("blocks funding on the wrong wallet chain", () => {
    vi.stubEnv("NEXT_PUBLIC_CHAIN_ID", "11155111");
    vi.stubEnv("NEXT_PUBLIC_LOCAL_DEVELOPMENT", "false");

    expect(validateEscrowFunding({
      walletAddress: buyer,
      walletChainId: 31337,
      details: fundingDetails(),
      balance: 200n,
    })).toBe("Wrong network. Switch your wallet to Sepolia to continue.");
  });

  it("blocks funding unless the escrow is awaiting payment and the wallet has enough ETH", () => {
    vi.stubEnv("NEXT_PUBLIC_CHAIN_ID", "11155111");
    vi.stubEnv("NEXT_PUBLIC_LOCAL_DEVELOPMENT", "false");

    expect(validateEscrowFunding({
      walletAddress: buyer,
      walletChainId: 11155111,
      details: fundingDetails("AwaitingDelivery"),
      balance: 200n,
    })).toBe("Funding is unavailable while the escrow is AwaitingDelivery.");
    expect(validateEscrowFunding({
      walletAddress: buyer,
      walletChainId: 11155111,
      details: fundingDetails(),
      balance: 99n,
    })).toBe("Wallet balance is insufficient to fund this escrow.");
  });
});

describe("escrow funding transaction", () => {
  it("deposits the exact on-chain required amount and waits for reconciliation", async () => {
    vi.stubEnv("NEXT_PUBLIC_CHAIN_ID", "11155111");
    vi.stubEnv("NEXT_PUBLIC_LOCAL_DEVELOPMENT", "false");
    const submitted = {
      hash: "0xabc",
      wait: vi.fn(async () => ({
        status: 1,
        blockNumber: 12,
        confirmations: async () => 1,
      })),
    };
    const deposit = vi.fn(async () => submitted);
    const state = vi.fn(async () => 0n);
    const requiredAmount = vi.fn(async () => 100n);
    vi.mocked(Contract).mockReturnValue({
      getFunction: vi.fn((name: string) => ({ deposit, state, requiredAmount })[name]),
    } as never);
    vi.mocked(BrowserProvider).mockImplementation(() => ({
      getSigner: async () => ({ getAddress: async () => buyer }),
      getBalance: async () => 200n,
      getNetwork: async () => ({ chainId: 11155111n }),
    }) as never);
    const reconcile = vi.fn(async () => undefined);

    const receipt = await fundEscrow({
      getProvider: async () => ({}),
      walletAddress: buyer,
      walletChainId: 11155111,
      details: fundingDetails(),
      reconcile,
    });

    expect(deposit).toHaveBeenCalledWith({ value: 100n });
    expect(state).not.toHaveBeenCalled();
    expect(requiredAmount).not.toHaveBeenCalled();
    expect(reconcile).toHaveBeenCalledOnce();
    expect(receipt).toMatchObject({ status: "COMPLETE", hash: "0xabc", blockNumber: "12" });
  });
});
