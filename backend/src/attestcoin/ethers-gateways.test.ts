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
}) {
  const transaction = {
    hash: `0x${"66".repeat(32)}`,
    wait: async () => ({
      status: options.status ?? 1,
      logs: [{}],
    }),
  };
  const submit = vi.fn(async () => transaction);
  (submit as any).staticCall = async () => options.staticClaimId ?? expectedClaimId;

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
});
