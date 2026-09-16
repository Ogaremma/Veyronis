import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { NimServiceFeePanel } from "./nim-service-fee-panel";
import type { NimServiceFeeState } from "./use-nim-service-fee";

const ADDRESS = "NQ07 0000 0000 0000 0000 0000 0000 0000 0000";

const baseState: NimServiceFeeState = {
  host: true,
  stage: "idle",
  recipient: ADDRESS,
  recipientValid: true,
  account: "",
  reference: "",
  error: "",
  payload: "veyronis:fee:v1:9f2c4d6e8a0b1c3d5e7f9012",
  payloadBytes: 40,
  pending: false,
  paid: false,
  blocksContinue: true,
  canAuthorize: true,
  canPay: false,
  setRecipient: vi.fn(),
  authorize: vi.fn(),
  pay: vi.fn(),
};

function feeState(
  overrides: Partial<NimServiceFeeState> = {},
): NimServiceFeeState {
  return { ...baseState, ...overrides } as NimServiceFeeState;
}

function render(overrides: Partial<NimServiceFeeState> = {}): string {
  return renderToStaticMarkup(<NimServiceFeePanel fee={feeState(overrides)} />);
}

function buttonTags(html: string): string[] {
  return html.match(/<button[^>]*>/g) ?? [];
}

describe("Nimiq service fee panel", () => {
  it("renders nothing outside Nimiq Pay", () => {
    expect(render({ host: false })).toBe("");
  });

  it("discloses the required fee, amount and reference data", () => {
    const html = render();
    expect(html).toContain("Nimiq Pay service fee");
    expect(html).toContain("0.01 NIM");
    expect(html).toContain("1000 Luna");
    expect(html).toContain("veyronis:fee:v1:9f2c4d6e8a0b1c3d5e7f9012");
    expect(html).toContain("Client-side Nimiq Pay service fee");
    expect(html).toContain("cannot be reversed");
  });

  it("offers the authorize and pay actions without calling either", () => {
    const html = render();
    expect(html).toContain("Authorize Nimiq Pay wallet");
    expect(html).toContain("Pay 0.01 NIM service fee");
    expect(baseState.authorize).not.toHaveBeenCalled();
    expect(baseState.pay).not.toHaveBeenCalled();
  });

  it("keeps payment disabled until the recipient is valid", () => {
    const html = render({ recipientValid: false, recipient: "nope" });
    expect(html).toContain("Enter a complete NQ...");
    expect(buttonTags(html)[1]).toContain("disabled");
  });

  it("disables both actions while a request is pending", () => {
    const html = render({ pending: true, canAuthorize: false, canPay: false });
    expect(html).toContain("Waiting for Nimiq Pay");
    const tags = buttonTags(html);
    expect(tags).toHaveLength(2);
    expect(tags[0]).toContain("disabled");
    expect(tags[1]).toContain("disabled");
  });

  it("keeps a retry path after a rejection or failure", () => {
    const html = render({
      stage: "failure",
      error: "You rejected the request in Nimiq Pay. No NIM was sent.",
      canAuthorize: true,
      canPay: true,
    });
    expect(html).toContain("Not completed");
    expect(html).toContain(
      "You rejected the request in Nimiq Pay. No NIM was sent.",
    );
    const tags = buttonTags(html);
    expect(tags[0]).not.toContain("disabled");
    expect(tags[1]).not.toContain("disabled");
  });

  it("shows the success state with the opaque reference and no further payment", () => {
    const reference = "a".repeat(64);
    const html = render({
      stage: "success",
      paid: true,
      reference,
      account: ADDRESS,
      canAuthorize: false,
      canPay: false,
    });
    expect(html).toContain("Service fee submitted");
    expect(html).toContain("You can continue with this");
    expect(html).toContain("opaque reference");
    expect(html).toContain(reference);
    const tags = buttonTags(html);
    expect(tags[0]).toContain("disabled");
    expect(tags[1]).toContain("disabled");
    expect(html).not.toContain("Enter a complete NQ...");
  });
});
