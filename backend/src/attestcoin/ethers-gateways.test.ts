import { Wallet } from "ethers";
import { describe, expect, it, vi } from "vitest";
import type { VerifiedEvidenceClaim } from "@veyronis/shared";
import {
  computeClaimId,
  computeSourceEvidenceKey,
} from "./attestcoin-verifier.js";
import { EthersEvidenceClaimRegistryGateway } from "./ethers-gateways.js";

const claim: VerifiedEvidenceClaim = {
  escrow: "0x1000000000000000000000000000000000000001",
  agreementCommitment: `0x${"11".repeat(32)}`,
  evidencePolicyCommitment: `0x${"22".repeat(32)}`,
  evidenceCommitment: `0x${"33".repeat(32)}`,
  evidenceType: `0x${"44".repeat(32)}`,
  sourceChainKey: 1,
  sourceTransactionHash: `0x${"55".repeat(32)}`,
  subject: "0x2000000000000000000000000000000000000002",
};

const expectedClaimId = computeClaimId(claim);
const sourceEvidenceKey = computeSourceEvidenceKey(claim);
const signerAddress = new Wallet(`0x${"11".repeat(32)}`).address;

function fakeSigner() {
  return new Wallet(`0x${"11".repeat(32)}`, {
    getNetwork: async () => ({ chainId: 11155111n, name: "sepolia" }),
  } as never);
}

function fakeRegistry(options: {
  status?: number;
  staticClaimId?: string;
  eventClaimId?: string;
  consumed?: boolean;
  boundEscrow?: string;
  authorizedVerifier?: string;
  wait?: () => Promise<{ status: number; logs: object[] }>;
}) {
  const transaction = {
    hash: `0x${"66".repeat(32)}`,
    wait:
      options.wait ??
      (async () => ({
        status: options.status ?? 1,
        logs: [{}],
      })),
  };
  const submit = vi.fn(async () => transaction);
  (submit as any).staticCall = async () =>
    options.staticClaimId ?? expectedClaimId;

  const consumed = vi.fn();
  (consumed as any).staticCall = async () => options.consumed ?? true;
  const sourceEvidence = vi.fn();
  (sourceEvidence as any).staticCall = async () =>
    options.boundEscrow ?? claim.escrow;
  const authorizedVerifier = vi.fn();
  (authorizedVerifier as any).staticCall = async () =>
    options.authorizedVerifier ?? signerAddress;

  return {
    interface: {
      parseLog: () => ({
        name: "VerifiedClaimAccepted",
        args: [
          options.eventClaimId ?? expectedClaimId,
          claim.escrow,
          claim.evidenceCommitment,
          sourceEvidenceKey,
        ],
      }),
    },
    getFunction: (name: string) => {
      if (name === "authorizedVerifier") return authorizedVerifier;
      if (name === "submitVerifiedClaim") return submit;
      if (name === "submitVerifiedConditionClaim") return submit;
      if (name === "submitVerifiedPrerequisiteClaim") return submit;
      if (name === "consumedClaims") return consumed;
      if (name === "sourceEvidenceEscrow") return sourceEvidence;
      throw new Error(`Unexpected registry function: ${name}`);
    },
  };
}

function gatewayWithFakeRegistry(options: Parameters<typeof fakeRegistry>[0]) {
  const gateway = new EthersEvidenceClaimRegistryGateway(
    "0x3000000000000000000000000000000000000003",
    fakeSigner(),
  );
  (gateway as any).registry = fakeRegistry(options);
  return gateway;
}

describe("EthersEvidenceClaimRegistryGateway", () => {
  it("requires a successful receipt, matching acceptance event, and post-state", async () => {
    const gateway = gatewayWithFakeRegistry({});
    const result = await gateway.submitVerifiedClaim(claim);
    expect(result.claimId).toBe(expectedClaimId);
    expect(result.transactionHash).toBe(`0x${"66".repeat(32)}`);
  });

  it("signs the authorized prerequisite and direct condition paths", async () => {
    const gateway = gatewayWithFakeRegistry({});
    await expect(
      gateway.submitVerifiedPrerequisiteClaim(claim),
    ).resolves.toMatchObject({
      claimId: expectedClaimId,
      transactionHash: `0x${"66".repeat(32)}`,
    });
    await expect(
      gateway.submitVerifiedConditionClaim(claim),
    ).resolves.toMatchObject({
      claimId: expectedClaimId,
      transactionHash: `0x${"66".repeat(32)}`,
    });
  });

  it("rejects a reverted registry transaction", async () => {
    const gateway = gatewayWithFakeRegistry({ status: 0 });
    await expect(gateway.submitVerifiedClaim(claim)).rejects.toThrow(
      "Registry transaction was not mined successfully",
    );
  });

  it("rejects a signer that is not the registry authorized verifier", async () => {
    const gateway = gatewayWithFakeRegistry({
      authorizedVerifier: "0x3000000000000000000000000000000000000003",
    });
    await expect(gateway.submitVerifiedClaim(claim)).rejects.toThrow(
      "Registry signer is not the authorized verifier",
    );
  });

  it("rejects a mismatched acceptance event", async () => {
    const gateway = gatewayWithFakeRegistry({
      eventClaimId: `0x${"77".repeat(32)}`,
    });
    await expect(gateway.submitVerifiedClaim(claim)).rejects.toThrow(
      "Registry acceptance event did not match the submitted claim",
    );
  });

  it("rejects a claim whose post-state was not recorded", async () => {
    const gateway = gatewayWithFakeRegistry({ consumed: false });
    await expect(gateway.submitVerifiedClaim(claim)).rejects.toThrow(
      "Registry post-submission state did not match the accepted claim",
    );
  });

  it("shares one broadcast across concurrent duplicate claim requests", async () => {
    let release!: () => void;
    const waiting = new Promise<void>((resolve) => {
      release = resolve;
    });
    const gateway = gatewayWithFakeRegistry({
      wait: async () => {
        await waiting;
        return { status: 1, logs: [{}] };
      },
    });

    const first = gateway.submitVerifiedConditionClaim(claim);
    const second = gateway.submitVerifiedConditionClaim(claim);
    release();
    await expect(Promise.all([first, second])).resolves.toHaveLength(2);

    const submit = (gateway as any).registry.getFunction(
      "submitVerifiedConditionClaim",
    );
    expect(submit).toHaveBeenCalledTimes(1);
  });

  it("serializes distinct claim submission work", async () => {
    const gateway = gatewayWithFakeRegistry({});
    const order: string[] = [];
    let release!: () => void;
    const waiting = new Promise<void>((resolve) => {
      release = resolve;
    });
    const first = (gateway as any).serializeSubmission(async () => {
      order.push("first-start");
      await waiting;
      order.push("first-end");
    });
    const second = (gateway as any).serializeSubmission(async () => {
      order.push("second-start");
    });

    await Promise.resolve();
    expect(order).toEqual(["first-start"]);
    release();
    await Promise.all([first, second]);
    expect(order).toEqual(["first-start", "first-end", "second-start"]);
  });

  it("reconciles a lost receipt response without rebroadcasting", async () => {
    const gateway = gatewayWithFakeRegistry({
      wait: async () => {
        throw new Error("response lost");
      },
    });
    (gateway as any).signer = {
      getAddress: async () => signerAddress,
      provider: {
        getTransactionReceipt: async () => ({ status: 1, logs: [{}] }),
      },
    };

    await expect(gateway.submitVerifiedClaim(claim)).resolves.toMatchObject({
      claimId: expectedClaimId,
    });
    expect(
      (gateway as any).registry.getFunction("submitVerifiedClaim"),
    ).toHaveBeenCalledTimes(1);
  });

  it("resumes a pending transaction on retry without a duplicate broadcast", async () => {
    let waits = 0;
    const gateway = gatewayWithFakeRegistry({
      wait: async () => {
        waits += 1;
        if (waits === 1) throw new Error("temporarily unavailable");
        return { status: 1, logs: [{}] };
      },
    });
    (gateway as any).signer = {
      getAddress: async () => signerAddress,
      provider: { getTransactionReceipt: async () => null },
    };

    await expect(gateway.submitVerifiedClaim(claim)).rejects.toThrow(
      "is pending; retry will resume",
    );
    await expect(gateway.submitVerifiedClaim(claim)).resolves.toMatchObject({
      claimId: expectedClaimId,
    });
    expect(
      (gateway as any).registry.getFunction("submitVerifiedClaim"),
    ).toHaveBeenCalledTimes(1);
  });

  it("rejects concurrent attempts to submit one claim through different modes", async () => {
    let release!: () => void;
    const waiting = new Promise<void>((resolve) => {
      release = resolve;
    });
    const gateway = gatewayWithFakeRegistry({
      wait: async () => {
        await waiting;
        return { status: 1, logs: [{}] };
      },
    });

    const first = gateway.submitVerifiedClaim(claim);
    await expect(gateway.submitVerifiedConditionClaim(claim)).rejects.toThrow(
      "already queued for another submission mode",
    );
    release();
    await expect(first).resolves.toMatchObject({ claimId: expectedClaimId });
  });
});
