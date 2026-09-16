/**
 * Nimiq Pay service fee used by the escrow-creation flow.
 *
 * The fee is a fixed, disclosed demo amount paid in native NIM through Nimiq
 * Pay while the app runs inside the Nimiq Pay app. It is a service-gating demo
 * only: Veyronis does not verify NIM payments, does not store them, and no
 * agreement state depends on them. See docs/nimiq-pay-integration.md.
 *
 * Everything in this module is pure. It never touches `window`, never imports
 * the Mini App SDK and never sends anything.
 */

import { formatNim } from "../wallet/nim-amount";
import { MAX_NIMIQ_DATA_BYTES, nimDataByteLength } from "../wallet/nimiq-pay";

/** Fixed demo service fee: 1000 Luna = 0.01 NIM. Integer Luna only. */
export const NIM_SERVICE_FEE_LUNA = 1000;

/** Display form of the fee, derived from the integer Luna value. */
export const NIM_SERVICE_FEE_LABEL = formatNim(NIM_SERVICE_FEE_LUNA);

/** Prefix of the deterministic transaction reference payload. */
export const NIM_SERVICE_FEE_PAYLOAD_PREFIX = "veyronis:fee:v1:";

/** The host rejects transaction data larger than this. */
export const NIM_SERVICE_FEE_PAYLOAD_MAX_BYTES = MAX_NIMIQ_DATA_BYTES;

/** Hex characters of the agreement nonce carried in the payload. */
const NIM_SERVICE_FEE_NONCE_CHARS = 24;

/**
 * Deterministic reference payload for an agreement. The same agreement always
 * produces the same payload, and the fixed prefix plus a bounded nonce snippet
 * keeps it inside the 64-byte transaction data limit for any input.
 */
export function nimServiceFeePayload(agreementNonce: string): string {
  return `${NIM_SERVICE_FEE_PAYLOAD_PREFIX}${nonceSnippet(agreementNonce)}`;
}

/** UTF-8 byte length of the payload, for diagnostics and assertions. */
export function nimServiceFeePayloadBytes(agreementNonce: string): number {
  return nimDataByteLength(nimServiceFeePayload(agreementNonce));
}

function nonceSnippet(agreementNonce: string): string {
  return agreementNonce
    .toLowerCase()
    .replace(/^0x/, "")
    .replace(/[^0-9a-f]/g, "")
    .slice(0, NIM_SERVICE_FEE_NONCE_CHARS);
}

/**
 * Shape-only Nimiq address check: `NQ` followed by 34 base32 characters, with
 * optional spaces ignored. It deliberately does not verify the address
 * checksum, which would require a base32 decode and a blake2b hash. It is used
 * only to stop obviously wrong input before the host is asked to move NIM.
 */
export function isNimiqAddress(value: string): boolean {
  return /^NQ[0-9A-Z]{34}$/.test(normalizeNimiqAddress(value));
}

/** Strips the spaces Nimiq addresses are usually displayed with. */
export function normalizeNimiqAddress(value: string): string {
  return value.replace(/\s+/g, "").toUpperCase();
}

export type NimServiceFeeStage = "idle" | "pending" | "success" | "failure";

/**
 * Shape of the value returned by `sendNimPayment`, described but never
 * interpreted. The published SDK documents the return value as the serialized
 * transaction, so a 32-byte hex value is not assumed to be a transaction hash.
 */
export type NimReferenceShape = "empty" | "hex-64" | "hex" | "text";

export function nimReferenceShape(reference: string): NimReferenceShape {
  if (reference.length === 0) return "empty";
  if (!/^[0-9a-f]+$/i.test(reference)) return "text";
  return reference.length === 64 ? "hex-64" : "hex";
}

/** Explanation shown next to the raw provider return value. */
export function describeNimReference(reference: string): string {
  switch (nimReferenceShape(reference)) {
    case "empty":
      return "Nimiq Pay returned an empty reference.";
    case "hex-64":
      return "Nimiq Pay returned a 32-byte hex value. It may be a transaction hash or a serialized transaction; Veyronis stores it as an opaque reference and does not treat it as a confirmed receipt.";
    case "hex":
      return `Nimiq Pay returned a hex value of ${reference.length} characters. It is kept as an opaque reference, not as a transaction hash.`;
    default:
      return `Nimiq Pay returned a non-hex value of ${reference.length} characters. It is kept as an opaque reference, not as a transaction hash.`;
  }
}

/** Disclosed limitation shown in the UI and in the integration doc. */
export const NIM_SERVICE_FEE_DISCLOSURE =
  "Demo service fee. The NIM leaves your Nimiq Pay wallet, but Veyronis does not verify or reconcile NIM payments yet, so this payment does not change any agreement state.";
