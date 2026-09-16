import { describe, expect, it } from "vitest";

import { NimiqPayError } from "../wallet/nimiq-pay";
import {
  NIM_SERVICE_FEE_DISCLOSURE,
  NIM_SERVICE_FEE_GATE_NOTE,
  NIM_SERVICE_FEE_LABEL,
  NIM_SERVICE_FEE_LUNA,
  NIM_SERVICE_FEE_PAYLOAD_MAX_BYTES,
  NIM_SERVICE_FEE_PAYLOAD_PREFIX,
  canAuthorizeNimServiceFee,
  canPayNimServiceFee,
  describeNimReference,
  isNimiqAddress,
  nimReferenceShape,
  nimServiceFeeBlocksContinue,
  nimServiceFeeMessage,
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
    expect(NIM_SERVICE_FEE_DISCLOSURE).toContain("Client-side");
  });
});

describe("Nimiq service fee gate", () => {
  it("never blocks the wizard outside Nimiq Pay", () => {
    expect(nimServiceFeeBlocksContinue({ host: false, paid: false })).toBe(
      false,
    );
    expect(nimServiceFeeBlocksContinue({ host: false, paid: true })).toBe(
      false,
    );
  });

  it("blocks the wizard inside Nimiq Pay until the fee is paid", () => {
    expect(nimServiceFeeBlocksContinue({ host: true, paid: false })).toBe(true);
    expect(nimServiceFeeBlocksContinue({ host: true, paid: true })).toBe(false);
  });

  it("explains why the wizard is blocked", () => {
    expect(NIM_SERVICE_FEE_GATE_NOTE).toContain(
      "Pay the Nimiq Pay service fee",
    );
  });
});

describe("Nimiq service fee authorization", () => {
  it("requires the host and no in-flight or already paid request", () => {
    expect(
      canAuthorizeNimServiceFee({ host: true, pending: false, paid: false }),
    ).toBe(true);
    expect(
      canAuthorizeNimServiceFee({ host: false, pending: false, paid: false }),
    ).toBe(false);
    expect(
      canAuthorizeNimServiceFee({ host: true, pending: true, paid: false }),
    ).toBe(false);
    expect(
      canAuthorizeNimServiceFee({ host: true, pending: false, paid: true }),
    ).toBe(false);
  });
});

describe("Nimiq service fee payment", () => {
  const ready = {
    host: true,
    pending: false,
    paid: false,
    authorized: true,
    recipientValid: true,
  };

  it("allows a payment when every precondition is met", () => {
    expect(canPayNimServiceFee(ready)).toBe(true);
  });

  it("blocks duplicate attempts while pending or already paid", () => {
    expect(canPayNimServiceFee({ ...ready, pending: true })).toBe(false);
    expect(canPayNimServiceFee({ ...ready, paid: true })).toBe(false);
  });

  it("requires the host, an authorized wallet and a valid recipient", () => {
    expect(canPayNimServiceFee({ ...ready, host: false })).toBe(false);
    expect(canPayNimServiceFee({ ...ready, authorized: false })).toBe(false);
    expect(canPayNimServiceFee({ ...ready, recipientValid: false })).toBe(
      false,
    );
  });
});

describe("Nimiq service fee error messages", () => {
  it("distinguishes a user rejection from a provider failure", () => {
    expect(
      nimServiceFeeMessage(new NimiqPayError("USER_REJECTED", "rejected")),
    ).toContain("No NIM was sent");
    expect(
      nimServiceFeeMessage(new NimiqPayError("PROVIDER_FAILURE", "failed")),
    ).toBe("failed");
    expect(
      nimServiceFeeMessage(new NimiqPayError("INVALID_INPUT", "bad fee")),
    ).toContain("bad fee");
    expect(
      nimServiceFeeMessage(
        new NimiqPayError("NIMIQ_PAY_UNAVAILABLE", "no host"),
      ),
    ).toBe("no host");
  });

  it("falls back to a safe message for unknown failures", () => {
    expect(nimServiceFeeMessage("boom")).toBe("The Nimiq Pay request failed.");
    expect(nimServiceFeeMessage(new Error(""))).toBe(
      "The Nimiq Pay request failed.",
    );
  });
});
