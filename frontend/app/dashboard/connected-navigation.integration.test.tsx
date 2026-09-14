import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DashboardHome } from "../wallet/dashboard-home";
import { restoreWalletSession } from "../wallet/session-restoration";
import {
  navigateAgreementBack,
  navigateAgreementHome,
} from "./agreement-navigation";

const address = "0x1000000000000000000000000000000000000001";

afterEach(() => vi.unstubAllGlobals());

describe("connected agreement navigation", () => {
  it.each([
    ["Back", navigateAgreementBack],
    ["Home", navigateAgreementHome],
  ])(
    "returns through %s and restores the connected dashboard",
    async (_label, navigate) => {
      const router = { push: vi.fn() };
      navigate(router);
      expect(router.push).toHaveBeenCalledWith("/");

      vi.stubGlobal(
        "fetch",
        vi.fn(
          async () =>
            new Response(JSON.stringify({ ok: true, address }), {
              status: 200,
              headers: { "content-type": "application/json" },
            }),
        ),
      );
      const restored = await restoreWalletSession({
        address,
        baseUrl: "https://api.test",
      });
      expect(restored).toBe(address);

      const html = renderToStaticMarkup(
        <DashboardHome
          address={restored!}
          balance="1"
          networkName="Sepolia"
          sendOpen={false}
          setSendOpen={() => {}}
          sendEth={async () => "0x1"}
        />,
      );
      expect(html).toContain("Connected");
      expect(html).toContain("Your wallet");
      expect(html).not.toContain("Connect wallet");
    },
  );
});
