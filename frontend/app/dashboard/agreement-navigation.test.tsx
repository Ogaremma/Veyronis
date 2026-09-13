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
    const backRouter = { back: vi.fn() };
    const homeRouter = { push: vi.fn() };
    navigateAgreementBack(backRouter);
    navigateAgreementHome(homeRouter);
    expect(backRouter.back).toHaveBeenCalledOnce();
    expect(homeRouter.push).toHaveBeenCalledWith("/");
  });
});
