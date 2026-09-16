import { describe, expect, it } from "vitest";
import {
  LUNA_PER_NIM,
  NimAmountError,
  assertLuna,
  formatNim,
  isValidLuna,
  lunaRejectionReason,
} from "./nim-amount";

describe("Nimiq Luna amounts", () => {
  it("accepts whole positive Luna amounts", () => {
    for (const value of [
      1,
      138,
      LUNA_PER_NIM,
      100_001,
      Number.MAX_SAFE_INTEGER,
    ]) {
      expect(assertLuna(value)).toBe(value);
      expect(isValidLuna(value)).toBe(true);
      expect(lunaRejectionReason(value)).toBeUndefined();
    }
    expect(assertLuna(1_000n)).toBe(1_000);
    expect(isValidLuna(1n)).toBe(true);
  });

  it("rejects zero, negative, fractional, unsafe, non-finite, and non-numeric amounts", () => {
    const rejected: readonly (readonly [unknown, string])[] = [
      [0, "NOT_POSITIVE"],
      [-1, "NOT_POSITIVE"],
      [0n, "NOT_POSITIVE"],
      [-5n, "NOT_POSITIVE"],
      [1.5, "NOT_AN_INTEGER"],
      [Number.NaN, "NOT_FINITE"],
      [Number.POSITIVE_INFINITY, "NOT_FINITE"],
      [Number.NEGATIVE_INFINITY, "NOT_FINITE"],
      [Number.MAX_SAFE_INTEGER + 1, "UNSAFE"],
      [BigInt(Number.MAX_SAFE_INTEGER) + 1n, "UNSAFE"],
      ["100000", "NOT_A_NUMBER"],
      [undefined, "NOT_A_NUMBER"],
      [null, "NOT_A_NUMBER"],
      [{}, "NOT_A_NUMBER"],
    ];
    for (const [value, reason] of rejected) {
      expect(lunaRejectionReason(value)).toBe(reason);
      expect(isValidLuna(value)).toBe(false);
      expect(() => assertLuna(value)).toThrow(NimAmountError);
    }
  });

  it("formats Luna for display separately from transaction validation", () => {
    expect(formatNim(0)).toBe("0 NIM");
    expect(formatNim(138)).toBe("0.00138 NIM");
    expect(formatNim(LUNA_PER_NIM)).toBe("1 NIM");
    expect(formatNim(150_000)).toBe("1.5 NIM");
    expect(formatNim(100_001)).toBe("1.00001 NIM");
    expect(formatNim(1_000_000_000n)).toBe("10000 NIM");
    expect(() => formatNim(-1)).toThrow(NimAmountError);
    expect(() => formatNim(1.5)).toThrow(NimAmountError);
    expect(() => assertLuna(0)).toThrow(NimAmountError);
  });
});
