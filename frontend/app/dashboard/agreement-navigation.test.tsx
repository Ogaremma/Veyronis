import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import {
  AgreementNavigation,
  navigateAgreementBack,
  navigateAgreementHome,
} from "./agreement-navigation";

describe("agreement navigation", () => {
  it("renders visible Back and Home controls", () => {
    const html = renderToStaticMarkup(
      <AgreementNavigation onBack={() => {}} onHome={() => {}} />,
    );
    expect(html).toContain(">Back<");
    expect(html).toContain(">Home<");
  });

  it("returns to the previous page and main control room", () => {
    const backRouter = { back: vi.fn(), push: vi.fn() };
    const homeRouter = { back: vi.fn(), push: vi.fn() };
    navigateAgreementBack(backRouter, { idx: 1 });
    navigateAgreementHome(homeRouter);
    expect(backRouter.back).toHaveBeenCalledOnce();
    expect(homeRouter.push).toHaveBeenCalledWith("/");
  });

  it("falls back to the main dashboard when there is no useful history", () => {
    const router = { back: vi.fn(), push: vi.fn() };
    navigateAgreementBack(router, { idx: 0 });
    expect(router.back).not.toHaveBeenCalled();
    expect(router.push).toHaveBeenCalledWith("/");
  });
});
