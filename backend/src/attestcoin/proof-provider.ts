import type { proofProvider } from "@gluwa/usc-sdk";

/** The proof shape consumed by Veyronis, independent of the SDK transport. */
export type AttestcoinProof = proofProvider.ContinuityResponse;

export interface AttestcoinProofProvider {
  getProof(transactionHash: string): Promise<AttestcoinProofResult>;
}

export type AttestcoinProofResult =
  | { success: true; data: AttestcoinProof }
  | { success: false; error?: string };

/** Adapts the installed SDK ProofBuilder to the Veyronis boundary. */
export class SdkAttestcoinProofProvider implements AttestcoinProofProvider {
  constructor(private readonly builder: proofProvider.service.ProofBuilder) {}

  async getProof(transactionHash: string): Promise<AttestcoinProofResult> {
    const result = await this.builder.getProof(transactionHash);
    if (result.success && result.data) return { success: true, data: result.data };
    return result.error
      ? { success: false, error: result.error }
      : { success: false };
  }
}
