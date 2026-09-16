/**
 * Nimiq Pay Mini App foundation (Phase 1).
 *
 * Nothing here runs in an ordinary desktop browser: the host is detected
 * through `window.nimiqPay`, the Mini App SDK is imported lazily and only after
 * that detection, and `init()` is cached so it runs at most once per page
 * session. This module never creates a wallet and never handles private keys.
 *
 * `sendNimPayment` must be called from an explicit user action. It is
 * deliberately not wired to page load, effects, or any background flow.
 */

import type {
  NimiqPayHostContext,
  NimiqProvider,
} from "@nimiq/mini-app-sdk" with { "resolution-mode": "import" };

import { NimAmountError, assertLuna } from "./nim-amount";

/** Maximum size of the Nimiq transaction data payload, in UTF-8 bytes. */
export const MAX_NIMIQ_DATA_BYTES = 64;

/** Safe, user-facing error categories produced by this module. */
export type NimiqPayErrorCode =
  | "NIMIQ_PAY_UNAVAILABLE"
  | "INVALID_INPUT"
  | "USER_REJECTED"
  | "PROVIDER_FAILURE";

export class NimiqPayError extends Error {
  readonly code: NimiqPayErrorCode;

  constructor(code: NimiqPayErrorCode, message: string, cause?: unknown) {
    super(message);
    this.name = "NimiqPayError";
    this.code = code;
    if (cause !== undefined) {
      this.cause = cause;
    }
  }
}

/**
 * Loose shape of a provider error payload. The published SDK declares these as
 * return values, so callers must handle them in addition to thrown errors.
 */
export interface NimiqProviderErrorResponse {
  readonly error: { readonly type?: string; readonly message?: string };
}

const REJECTION_CODES: readonly unknown[] = [4001, "4001"];
const REJECTION_NAMES: readonly string[] = [
  "PermissionDeniedError",
  "UserRejectedRequestError",
  "ActionRejectedError",
];
const REJECTION_PHRASES: readonly string[] = [
  "user rejected",
  "user denied",
  "user cancelled",
  "user canceled",
  "rejected by user",
  "denied by user",
  "permissiondeniederror",
];

/** True when the page is running inside the Nimiq Pay host. SSR safe. */
export function isNimiqPayHost(): boolean {
  if (typeof window === "undefined") return false;
  return Boolean(window.nimiqPay);
}

/** The host context injected by Nimiq Pay, or undefined outside Nimiq Pay. */
export function getNimiqPayHost(): NimiqPayHostContext | undefined {
  return typeof window === "undefined" ? undefined : window.nimiqPay;
}

/** True when the value looks like a provider error payload rather than a result. */
export function isNimiqErrorResponse(
  value: unknown,
): value is NimiqProviderErrorResponse {
  if (typeof value !== "object" || value === null) return false;
  const error = (value as { error?: unknown }).error;
  return typeof error === "object" && error !== null;
}

function isUserRejection(value: unknown): boolean {
  if (typeof value !== "object" || value === null) return false;
  const candidate = value as {
    code?: unknown;
    name?: unknown;
    message?: unknown;
    error?: { type?: unknown; message?: unknown };
  };
  if (REJECTION_CODES.some((code) => code === candidate.code)) return true;
  if (
    typeof candidate.name === "string" &&
    REJECTION_NAMES.includes(candidate.name)
  ) {
    return true;
  }
  const texts: string[] = [];
  if (typeof candidate.message === "string") texts.push(candidate.message);
  const nested = candidate.error;
  if (typeof nested === "object" && nested !== null) {
    if (typeof nested.type === "string") texts.push(nested.type);
    if (typeof nested.message === "string") texts.push(nested.message);
  }
  return texts.some((text) => {
    const lower = text.toLowerCase();
    return REJECTION_PHRASES.some((phrase) => lower.includes(phrase));
  });
}

/**
 * Maps any thrown value or provider error payload into a safe category while
 * keeping the original value available as the error cause.
 */
export function toNimiqPayError(error: unknown): NimiqPayError {
  if (error instanceof NimiqPayError) return error;
  if (error instanceof NimAmountError) {
    return new NimiqPayError("INVALID_INPUT", error.message, error);
  }
  if (isUserRejection(error)) {
    return new NimiqPayError(
      "USER_REJECTED",
      "The Nimiq Pay request was rejected by the user.",
      error,
    );
  }
  return new NimiqPayError(
    "PROVIDER_FAILURE",
    "Nimiq Pay could not complete the request.",
    error,
  );
}

let providerPromise: Promise<NimiqProvider> | undefined;

/**
 * Resolves the Nimiq provider through the Mini App SDK `init()`.
 *
 * The SDK is imported lazily and only after Nimiq Pay has been detected, and
 * the resulting promise is cached, so `init()` runs at most once per page
 * session. Outside Nimiq Pay this rejects without importing the SDK.
 */
export function getNimiqProvider(): Promise<NimiqProvider> {
  if (!isNimiqPayHost()) {
    return Promise.reject(
      new NimiqPayError(
        "NIMIQ_PAY_UNAVAILABLE",
        "Nimiq Pay was not detected in this browser.",
      ),
    );
  }
  providerPromise ??= initializeNimiqProvider();
  return providerPromise;
}

async function initializeNimiqProvider(): Promise<NimiqProvider> {
  try {
    const sdk = await import("@nimiq/mini-app-sdk");
    return await sdk.init();
  } catch (error) {
    throw toNimiqPayError(error);
  }
}

/**
 * Runs one explicit `listAccounts()` call and returns the authorized Nimiq
 * addresses. Rejects when Nimiq Pay is unavailable, when the user denies the
 * request, or when the provider returns an error payload.
 */
export async function getNimiqAccounts(): Promise<string[]> {
  const provider = await getNimiqProvider();
  let result: string[] | NimiqProviderErrorResponse;
  try {
    result = await provider.listAccounts();
  } catch (error) {
    throw toNimiqPayError(error);
  }
  if (isNimiqErrorResponse(result)) throw toNimiqPayError(result);
  return result;
}

/** UTF-8 byte length of a transaction data payload. */
export function nimDataByteLength(data: string): number {
  return new TextEncoder().encode(data).byteLength;
}

function assertNimRecipient(recipient: unknown): string {
  if (typeof recipient !== "string" || recipient.trim().length === 0) {
    throw new NimiqPayError(
      "INVALID_INPUT",
      "A Nimiq recipient address is required.",
    );
  }
  return recipient.trim();
}

function assertNimData(data: unknown): string {
  if (typeof data !== "string") {
    throw new NimiqPayError(
      "INVALID_INPUT",
      "Transaction data must be a string.",
    );
  }
  const bytes = nimDataByteLength(data);
  if (bytes > MAX_NIMIQ_DATA_BYTES) {
    throw new NimiqPayError(
      "INVALID_INPUT",
      `Transaction data must be at most ${MAX_NIMIQ_DATA_BYTES} bytes (received ${bytes}).`,
    );
  }
  return data;
}

export interface SendNimPaymentInput {
  /** Nimiq recipient address. Never defaulted by this module. */
  readonly recipient: string;
  /** Positive, whole amount in Luna (1 NIM = 100 000 Luna). */
  readonly valueLuna: number | bigint;
  /** Short reference payload attached to the transaction (max 64 UTF-8 bytes). */
  readonly data: string;
  /** Optional whole fee in Luna. Never defaulted by this module. */
  readonly feeLuna?: number | bigint;
}

export interface NimPaymentResult {
  /** Account Nimiq Pay authorized for this payment. */
  readonly sender: string;
  /**
   * Provider-returned transaction reference. The published SDK documents this
   * as the serialized transaction, so treat it as opaque and do not parse it.
   */
  readonly reference: string;
}

/**
 * Signs and sends a basic Nimiq transaction with a data payload.
 *
 * Call this only from an explicit user action. It performs host detection, one
 * cached `init()`, one explicit `listAccounts()` authorization, and one
 * `sendBasicTransactionWithData()` call. It never runs from page load or an
 * effect, and it never sends a real transaction by itself.
 */
export async function sendNimPayment(
  input: SendNimPaymentInput,
): Promise<NimPaymentResult> {
  let recipient: string;
  let valueLuna: number;
  let data: string;
  let feeLuna: number | undefined;
  try {
    recipient = assertNimRecipient(input.recipient);
    valueLuna = assertLuna(input.valueLuna);
    data = assertNimData(input.data);
    feeLuna =
      input.feeLuna === undefined ? undefined : assertLuna(input.feeLuna);
  } catch (error) {
    throw toNimiqPayError(error);
  }

  const provider = await getNimiqProvider();
  const accounts = await getNimiqAccounts();
  const sender = accounts[0];
  if (sender === undefined) {
    throw new NimiqPayError(
      "PROVIDER_FAILURE",
      "Nimiq Pay did not return an authorized account.",
    );
  }

  const transaction =
    feeLuna === undefined
      ? { recipient, value: valueLuna, data }
      : { recipient, value: valueLuna, data, fee: feeLuna };

  let result: string | NimiqProviderErrorResponse;
  try {
    result = await provider.sendBasicTransactionWithData(transaction);
  } catch (error) {
    throw toNimiqPayError(error);
  }
  if (isNimiqErrorResponse(result)) throw toNimiqPayError(result);
  if (typeof result !== "string" || result.length === 0) {
    throw new NimiqPayError(
      "PROVIDER_FAILURE",
      "Nimiq Pay returned an empty transaction reference.",
    );
  }
  return { sender, reference: result };
}

export interface NimiqPayReadiness {
  readonly host: boolean;
  readonly providerInitialized: boolean;
  readonly language?: string;
}

/**
 * Non-invasive development diagnostic. It only reports whether the host was
 * detected and whether `init()` has been started; it never triggers host work
 * and never changes the wallet UX.
 */
export function getNimiqPayReadiness(): NimiqPayReadiness {
  const host = getNimiqPayHost();
  const language = host?.language;
  return {
    host: isNimiqPayHost(),
    providerInitialized: providerPromise !== undefined,
    ...(typeof language === "string" ? { language } : {}),
  };
}
