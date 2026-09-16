import { describe, expect, it } from "vitest";

import {
  NIM_SERVICE_FEE_DISCLOSURE,
  NIM_SERVICE_FEE_LABEL,
  NIM_SERVICE_FEE_LUNA,
  NIM_SERVICE_FEE_PAYLOAD_MAX_BYTES,
  NIM_SERVICE_FEE_PAYLOAD_PREFIX,
  describeNimReference,
  isNimiqAddress,
  nimReferenceShape,
  nimServiceFeePayload,
  nimServiceFeePayloadBytes,
  normalizeNimiqAddress,
} from "./nim-service-fee";

const NONCE =
  "0x9f2c4d6e8a0b1c3d5e7f9012345678abcdef0123456789abcdef0123456789abcd";
const OTHER_NONCE =
  "0x11223344556677889900aabbccddeeff00112233445566778899aabbccddeeff";

describe("Nimiq service fee amount", () => {
  it("is a fixed demo fee of 1000 Luna", () => {
    expect(NIM_SERVICE_FEE_LUNA).toBe(1000);
    expect(NIM_SERVICE_FEE_LABEL).toBe("0.01 NIM");
  });
});

describe("Nimiq service fee payload", () => {
  it("is deterministic for the same agreement nonce", () => {
    expect(nimServiceFeePayload(NONCE)).toBe(nimServiceFeePayload(NONCE));
    expect(nimServiceFeePayload(NONCE)).toBe(
      `${NIM_SERVICE_FEE_PAYLOAD_PREFIX}9f2c4d6e8a0b1c3d5e7f9012`,
    );
  });

  it("differs between agreement nonces", () => {
    expect(nimServiceFeePayload(NONCE)).not.toBe(
      nimServiceFeePayload(OTHER_NONCE),
    );
  });

  it("stays inside the 64-byte transaction data limit", () => {
    expect(nimServiceFeePayloadBytes(NONCE)).toBeLessThanOrEqual(
      NIM_SERVICE_FEE_PAYLOAD_MAX_BYTES,
    );
    expect(nimServiceFeePayloadBytes("")).toBeLessThanOrEqual(
      NIM_SERVICE_FEE_PAYLOAD_MAX_BYTES,
    );
    expect(nimServiceFeePayloadBytes("z".repeat(5000))).toBeLessThanOrEqual(
      NIM_SERVICE_FEE_PAYLOAD_MAX_BYTES,
    );
  });
});

describe("Nimiq address shape check", () => {
  it("accepts a correctly shaped NQ address", () => {
    expect(isNimiqAddress("NQ07 0000 0000 0000 0000 0000 0000 0000 0000")).toBe(
      true,
    );
    expect(isNimiqAddress("nq0700000000000000000000000000000000")).toBe(true);
  });

  it("rejects 0x addresses, wrong prefixes and wrong lengths", () => {
    expect(isNimiqAddress("0x9f2c4d6e8a0b1c3d5e7f9012345678abcd")).toBe(false);
    expect(isNimiqAddress("")).toBe(false);
    expect(isNimiqAddress("NQ0700")).toBe(false);
    expect(isNimiqAddress("AQ0700000000000000000000000000000000")).toBe(false);
    expect(isNimiqAddress(`NQ${"0".repeat(35)}`)).toBe(false);
  });

  it("normalizes display spacing", () => {
    expect(normalizeNimiqAddress(" nq07 0000 0000 ")).toBe("NQ0700000000");
  });
});

describe("Nimiq payment reference handling", () => {
  it("classifies the provider return value without interpreting it", () => {
    expect(nimReferenceShape("")).toBe("empty");
    expect(nimReferenceShape("a".repeat(64))).toBe("hex-64");
    expect(nimReferenceShape("deadbeef")).toBe("hex");
    expect(nimReferenceShape("serialized-tx-payload")).toBe("text");
  });

  it("never claims the reference is a confirmed transaction hash", () => {
    const described = describeNimReference("a".repeat(64));
    expect(described).toContain("opaque reference");
    expect(described).toContain(
      "may be a transaction hash or a serialized transaction",
    );
  });

  it("documents the missing backend verification", () => {
    expect(NIM_SERVICE_FEE_DISCLOSURE).toContain("does not verify");
  });
});
