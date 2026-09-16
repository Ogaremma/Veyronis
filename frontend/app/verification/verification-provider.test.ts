import { describe, expect, it } from "vitest";

import {
  activeVerificationProvider,
  attestcoinVerificationProvider,
  providerVerificationLabel,
  verificationProviders,
  type VerificationProvider,
} from "./verification-provider";

describe("verification provider boundary", () => {
  it("exposes Attestcoin as the only active provider", () => {
    expect(activeVerificationProvider).toBe(attestcoinVerificationProvider);
    expect(attestcoinVerificationProvider.id).toBe("attestcoin");
    expect(verificationProviders).toEqual([attestcoinVerificationProvider]);
  });

  it("keeps the existing dashboard wording", () => {
    expect(providerVerificationLabel()).toBe(
      "Attestcoin Protocol on Creditcoin",
    );
    expect(providerVerificationLabel(true)).toBe(
      "Verified by Attestcoin Protocol on Creditcoin",
    );
  });

  it("labels any provider descriptor without code changes", () => {
    const candidate: VerificationProvider = {
      id: "candidate",
      label: "Candidate Provider",
      attestationChain: "Candidate Chain",
      status: "active",
    };
    expect(providerVerificationLabel(false, candidate)).toBe(
      "Candidate Provider",
    );
    expect(providerVerificationLabel(true, candidate)).toBe(
      "Verified by Candidate Provider",
    );
  });
});
