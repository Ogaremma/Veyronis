import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { NimiqPayError } from "../wallet/nimiq-pay";
import {
  NimServiceFeePanel,
  nimServiceFeeMessage,
} from "./nim-service-fee-panel";

const wallet = vi.hoisted(() => ({
  readiness: vi.fn(),
  accounts: vi.fn(),
  pay: vi.fn(),
}));

vi.mock("../wallet/nimiq-pay", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../wallet/nimiq-pay")>();
  return {
    ...actual,
    getNimiqAccounts: wallet.accounts,
    getNimiqPayReadiness: wallet.readiness,
    sendNimPayment: wallet.pay,
  };
});

const NONCE =
  "0x9f2c4d6e8a0b1c3d5e7f9012345678abcdef0123456789abcdef0123456789abcd";

beforeEach(() => {
  wallet.readiness
    .mockReset()
    .mockReturnValue({ host: false, providerInitialized: false });
  wallet.accounts.mockReset();
  wallet.pay.mockReset();
});

describe("Nimiq service fee panel", () => {
  it("renders nothing and touches no wallet API in an ordinary browser", () => {
    const html = renderToStaticMarkup(
      <NimServiceFeePanel agreementNonce={NONCE} />,
    );
    expect(html).toBe("");
    expect(wallet.readiness).not.toHaveBeenCalled();
    expect(wallet.accounts).not.toHaveBeenCalled();
    expect(wallet.pay).not.toHaveBeenCalled();
  });

  it("never requests accounts or sends a payment during render", () => {
    wallet.readiness.mockReturnValue({
      host: true,
      providerInitialized: false,
    });
    renderToStaticMarkup(<NimServiceFeePanel agreementNonce={NONCE} />);
    expect(wallet.accounts).not.toHaveBeenCalled();
    expect(wallet.pay).not.toHaveBeenCalled();
  });
});

describe("Nimiq service fee error messages", () => {
  it("distinguishes a user rejection from a provider failure", () => {
    expect(
      nimServiceFeeMessage(new NimiqPayError("USER_REJECTED", "rejected")),
    ).toContain("No NIM was sent");
    expect(
      nimServiceFeeMessage(
        new NimiqPayError("PROVIDER_FAILURE", "Nimiq Pay failed."),
      ),
    ).toBe("Nimiq Pay failed.");
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
