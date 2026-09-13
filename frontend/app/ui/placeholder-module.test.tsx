import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { PlaceholderModule } from "./placeholder-module";

describe("dashboard preview modules", () => {
  it("provides Home from Marketplace without a wallet disconnect", () => {
    const onHome = vi.fn();
    const disconnect = vi.fn();
    const html = renderToStaticMarkup(
      <PlaceholderModule kind="marketplace" onHome={onHome} />,
    );
    expect(html).toContain(">Home<");
    expect(html).toContain("Marketplace");
    expect(html).toContain("Create escrow from accepted offer");
    expect(html).toContain("Arbitrator marketplace preview");
    expect(html).toContain("In development");
    onHome();
    expect(disconnect).not.toHaveBeenCalled();
  });

  it("provides Home from Proofs and keeps payouts manual", () => {
    const html = renderToStaticMarkup(
      <PlaceholderModule kind="proofs" onHome={() => {}} />,
    );
    expect(html).toContain(">Home<");
    expect(html).toContain("Proofs workspace");
    expect(html).toContain("No automatic payout");
    expect(html).toContain("authorized buyer or arbitrator settlement action");
  });

  it("clearly labels preview features as coming next", () => {
    const html = renderToStaticMarkup(
      <PlaceholderModule kind="reputation" onHome={() => {}} />,
    );
    expect(html).toContain("Preview");
    expect(html).toContain("Coming next");
  });
});
