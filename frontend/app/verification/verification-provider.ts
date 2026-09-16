/**
 * Verification provider boundary.
 *
 * Attestcoin on Creditcoin is the provider that is active today and the only
 * one implemented. This module exists so the verification layer is expressed as
 * a provider descriptor rather than a hard-coded product name, so a future
 * provider can be added without rewriting every screen that names the
 * provider. No other provider is implemented and none is claimed as working.
 */

export type VerificationProviderStatus = "active";

export interface VerificationProvider {
  /** Stable machine identifier. Safe to compare or persist. */
  readonly id: string;
  /** Human-readable provider name shown in the UI. */
  readonly label: string;
  /** Chain that anchors the attestation. */
  readonly attestationChain: string;
  /** Whether this provider verifies evidence for new agreements today. */
  readonly status: VerificationProviderStatus;
}

export const attestcoinVerificationProvider: VerificationProvider = {
  id: "attestcoin",
  label: "Attestcoin Protocol on Creditcoin",
  attestationChain: "Creditcoin",
  status: "active",
};

/**
 * Provider used for new agreements. Today this is always Attestcoin; callers
 * read the label from here instead of hard-coding the name.
 */
export const activeVerificationProvider = attestcoinVerificationProvider;

/** Providers known to this build. Currently a single active entry. */
export const verificationProviders: readonly VerificationProvider[] = [
  attestcoinVerificationProvider,
];

/**
 * Provider label used by the dashboard. `verified` only adds the prefix that
 * the existing UI already used.
 */
export function providerVerificationLabel(
  verified = false,
  provider: VerificationProvider = activeVerificationProvider,
): string {
  return verified ? `Verified by ${provider.label}` : provider.label;
}
