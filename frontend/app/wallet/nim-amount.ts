/**
 * Nimiq amount helpers.
 *
 * Transaction values are integer Luna (1 NIM = 100 000 Luna). Validation and
 * display formatting are deliberately separate concerns: a payment must be a
 * strictly positive whole number of Luna, while zero remains displayable.
 */

export const LUNA_PER_NIM = 100_000;

/** Number of decimal places implied by LUNA_PER_NIM. */
export const LUNA_DECIMALS = String(LUNA_PER_NIM).length - 1;

export type LunaRejectionReason =
  "NOT_A_NUMBER" | "NOT_FINITE" | "NOT_AN_INTEGER" | "NOT_POSITIVE" | "UNSAFE";

export class NimAmountError extends Error {
  readonly reason: LunaRejectionReason;

  constructor(reason: LunaRejectionReason, message: string) {
    super(message);
    this.name = "NimAmountError";
    this.reason = reason;
  }
}

const REJECTION_MESSAGES: Record<LunaRejectionReason, string> = {
  NOT_A_NUMBER: "Luna amounts must be numbers or bigints.",
  NOT_FINITE: "Luna amounts must be finite.",
  NOT_AN_INTEGER: "Luna amounts must be whole numbers.",
  NOT_POSITIVE: "Luna amounts must be greater than zero.",
  UNSAFE: "Luna amounts must be safe integers.",
};

/** Explains why a value cannot be a Luna amount, or undefined when it can. */
export function lunaRejectionReason(
  value: unknown,
): LunaRejectionReason | undefined {
  if (typeof value === "bigint") {
    if (value <= 0n) return "NOT_POSITIVE";
    if (value > BigInt(Number.MAX_SAFE_INTEGER)) return "UNSAFE";
    return undefined;
  }
  if (typeof value !== "number") return "NOT_A_NUMBER";
  if (!Number.isFinite(value)) return "NOT_FINITE";
  if (!Number.isInteger(value)) return "NOT_AN_INTEGER";
  if (value <= 0) return "NOT_POSITIVE";
  if (!Number.isSafeInteger(value)) return "UNSAFE";
  return undefined;
}

export function isValidLuna(value: unknown): value is number | bigint {
  return lunaRejectionReason(value) === undefined;
}

/**
 * Validates a transaction amount and returns the integer Luna number the Nimiq
 * provider expects. Comparisons are integer-only: no floating point arithmetic
 * derives the value that is sent to the wallet.
 */
export function assertLuna(value: unknown): number {
  const reason = lunaRejectionReason(value);
  if (reason) throw new NimAmountError(reason, REJECTION_MESSAGES[reason]);
  if (typeof value === "number") return value;
  if (typeof value === "bigint") return Number(value);
  throw new NimAmountError("NOT_A_NUMBER", REJECTION_MESSAGES.NOT_A_NUMBER);
}

/**
 * Display formatter, separate from transaction validation. Zero is displayable
 * even though the payment path rejects it.
 */
export function formatNim(value: number | bigint): string {
  const luna = displayableLuna(value);
  const whole = luna / BigInt(LUNA_PER_NIM);
  const fraction = luna % BigInt(LUNA_PER_NIM);
  if (fraction === 0n) return `${whole} NIM`;
  const decimals = fraction
    .toString()
    .padStart(LUNA_DECIMALS, "0")
    .replace(/0+$/, "");
  return `${whole}.${decimals} NIM`;
}

function displayableLuna(value: number | bigint): bigint {
  if (typeof value === "bigint") {
    if (value < 0n) {
      throw new NimAmountError("NOT_POSITIVE", REJECTION_MESSAGES.NOT_POSITIVE);
    }
    return value;
  }
  if (!Number.isFinite(value)) {
    throw new NimAmountError("NOT_FINITE", REJECTION_MESSAGES.NOT_FINITE);
  }
  if (!Number.isInteger(value)) {
    throw new NimAmountError(
      "NOT_AN_INTEGER",
      REJECTION_MESSAGES.NOT_AN_INTEGER,
    );
  }
  if (value < 0) {
    throw new NimAmountError("NOT_POSITIVE", REJECTION_MESSAGES.NOT_POSITIVE);
  }
  if (!Number.isSafeInteger(value)) {
    throw new NimAmountError("UNSAFE", REJECTION_MESSAGES.UNSAFE);
  }
  return BigInt(value);
}
