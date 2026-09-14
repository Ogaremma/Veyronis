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

  it("returns from agreement detail to the connected wallet dashboard", () => {
    const backRouter = { back: vi.fn(), push: vi.fn() };
    const homeRouter = { back: vi.fn(), push: vi.fn() };
    navigateAgreementBack(backRouter);
    navigateAgreementHome(homeRouter);
    expect(backRouter.back).not.toHaveBeenCalled();
    expect(backRouter.push).toHaveBeenCalledWith("/");
    expect(homeRouter.push).toHaveBeenCalledWith("/");
  });

  it("never returns to the external wallet connection screen", () => {
    const router = { back: vi.fn(), push: vi.fn() };
    navigateAgreementBack(router);
    expect(router.back).not.toHaveBeenCalled();
    expect(router.push).toHaveBeenCalledWith("/");
  });
});
