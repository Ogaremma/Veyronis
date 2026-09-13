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
const escrow = "0x4000000000000000000000000000000000000004";

function fundingDetails(
  state = "AwaitingPayment",
  depositedAmount = "0",
): AgreementDetails {
  return {
    metadata: { id: "0x1", buyer, requiredAmount: "100" },
    role: "buyer",
    chain: {
      escrowAddress: escrow,
      buyer,
      seller,
      requiredAmount: "100",
      depositedAmount,
      state,
    },
  } as AgreementDetails;
}

function mockEscrowContract(options: {
  states?: bigint[];
  deposited?: bigint[];
  required?: bigint[];
  deposit?: () => Promise<unknown>;
}) {
  const functions = {
    state: vi.fn(),
    depositedAmount: vi.fn(),
    requiredAmount: vi.fn(),
    deposit: vi.fn(options.deposit ?? (async () => ({
      hash: "0xabc",
      wait: vi.fn(async () => ({
        status: 1,
        blockNumber: 12,
        confirmations: async () => 1,
      })),
    }))),
  };
  for (const value of options.states ?? [0n, 1n]) functions.state.mockResolvedValueOnce(value);
  for (const value of options.deposited ?? [0n, 100n]) functions.depositedAmount.mockResolvedValueOnce(value);
  for (const value of options.required ?? [100n, 100n]) functions.requiredAmount.mockResolvedValueOnce(value);
  vi.mocked(Contract).mockImplementation(((address: string) => {
    expect(address).toBe(escrow);
    return {
      getFunction: (name: keyof typeof functions) => functions[name],
    } as never;
  }) as never);
  vi.mocked(BrowserProvider).mockImplementation(() => ({
    getSigner: async () => ({ getAddress: async () => buyer }),
    getBalance: async () => 200n,
    getNetwork: async () => ({ chainId: 11155111n }),
  }) as never);
  return functions;
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

  it("blocks funding on the wrong wallet chain before constructing a transaction", async () => {
    vi.stubEnv("NEXT_PUBLIC_CHAIN_ID", "11155111");
    vi.stubEnv("NEXT_PUBLIC_LOCAL_DEVELOPMENT", "false");
    mockEscrowContract({ states: [], deposited: [], required: [] });

    await expect(fundEscrow({
      getProvider: async () => ({}),
      walletAddress: buyer,
      walletChainId: 31337,
      details: fundingDetails(),
      reconcile: async () => undefined,
    })).rejects.toThrow("Wrong network. Switch your wallet to Sepolia to continue.");
    expect(Contract).not.toHaveBeenCalled();
  });

  it("blocks an incorrect on-chain required amount before submission", async () => {
    vi.stubEnv("NEXT_PUBLIC_CHAIN_ID", "11155111");
    vi.stubEnv("NEXT_PUBLIC_LOCAL_DEVELOPMENT", "false");
    const contract = mockEscrowContract({
      states: [0n],
      deposited: [0n],
      required: [101n],
    });

    await expect(fundEscrow({
      getProvider: async () => ({}),
      walletAddress: buyer,
      walletChainId: 11155111,
      details: fundingDetails(),
      reconcile: async () => undefined,
    })).rejects.toThrow("The escrow required amount does not match agreement metadata.");
    expect(contract.deposit).not.toHaveBeenCalled();
  });
});

describe("escrow funding transaction", () => {
  it("targets the escrow, deposits the exact wei, and confirms a receipt", async () => {
    vi.stubEnv("NEXT_PUBLIC_CHAIN_ID", "11155111");
    vi.stubEnv("NEXT_PUBLIC_LOCAL_DEVELOPMENT", "false");
    const contract = mockEscrowContract({});
    const updates: string[] = [];

    const receipt = await fundEscrow({
      getProvider: async () => ({}),
      walletAddress: buyer,
      walletChainId: 11155111,
      details: fundingDetails(),
      reconcile: async () => fundingDetails("AwaitingDelivery", "100"),
      onTransaction: value => updates.push(value.status),
    });

    expect(Contract).toHaveBeenCalledWith(expect.anything(), expect.anything(), expect.anything());
    expect(contract.deposit).toHaveBeenCalledWith({ value: 100n });
    expect(updates).toEqual([
      "AWAITING_WALLET_SIGNATURE",
      "TRANSACTION_SUBMITTED",
      "CONFIRMING",
      "CONFIRMED",
      "RECONCILING",
      "COMPLETE",
    ]);
    expect(receipt).toMatchObject({ status: "COMPLETE", hash: "0xabc", blockNumber: "12" });
  });

  it("reports a wallet rejection without retrying", async () => {
    vi.stubEnv("NEXT_PUBLIC_CHAIN_ID", "11155111");
    vi.stubEnv("NEXT_PUBLIC_LOCAL_DEVELOPMENT", "false");
    const contract = mockEscrowContract({
      states: [0n],
      deposited: [0n],
      required: [100n],
      deposit: vi.fn(async () => {
        throw Object.assign(new Error("rejected"), { code: 4001 });
      }),
    });
    const reconcile = vi.fn(async () => undefined);

    const receipt = await fundEscrow({
      getProvider: async () => ({}),
      walletAddress: buyer,
      walletChainId: 11155111,
      details: fundingDetails(),
      reconcile,
    });

    expect(receipt).toMatchObject({ status: "USER_REJECTED", error: "rejected" });
    expect(contract.deposit).toHaveBeenCalledOnce();
    expect(reconcile).not.toHaveBeenCalled();
  });

  it("reports a reverted receipt and does not mark the escrow funded", async () => {
    vi.stubEnv("NEXT_PUBLIC_CHAIN_ID", "11155111");
    vi.stubEnv("NEXT_PUBLIC_LOCAL_DEVELOPMENT", "false");
    mockEscrowContract({
      states: [0n],
      deposited: [0n],
      required: [100n],
      deposit: async () => ({
        hash: "0xdef",
        wait: async () => ({
          status: 0,
          blockNumber: 13,
          confirmations: async () => 1,
        }),
      }),
    });
    const reconcile = vi.fn(async () => undefined);

    const receipt = await fundEscrow({
      getProvider: async () => ({}),
      walletAddress: buyer,
      walletChainId: 11155111,
      details: fundingDetails(),
      reconcile,
    });

    expect(receipt).toMatchObject({
      status: "TRANSACTION_REVERTED",
      hash: "0xdef",
      error: "The transaction reverted on-chain.",
    });
    expect(reconcile).not.toHaveBeenCalled();
  });

  it("waits for backend reconciliation when it is temporarily stale", async () => {
    vi.stubEnv("NEXT_PUBLIC_CHAIN_ID", "11155111");
    vi.stubEnv("NEXT_PUBLIC_LOCAL_DEVELOPMENT", "false");
    const contract = mockEscrowContract({});
    const reconcile = vi.fn(async () => fundingDetails("AwaitingPayment", "0"));

    const receipt = await fundEscrow({
      getProvider: async () => ({}),
      walletAddress: buyer,
      walletChainId: 11155111,
      details: fundingDetails(),
      reconcile,
    });

    expect(receipt).toMatchObject({
      status: "AWAITING_RECONCILIATION",
      message: "Funding submitted, waiting for chain reconciliation.",
    });
    expect(contract.deposit).toHaveBeenCalledOnce();
    expect(reconcile).toHaveBeenCalledOnce();
  });
});
