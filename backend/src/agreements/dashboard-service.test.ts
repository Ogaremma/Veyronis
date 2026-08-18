import { describe, expect, it } from "vitest";
import { actionsFor } from "./dashboard-service.js";
describe("participant-specific agreement actions", () => {
  it("only exposes actions permitted by role and authoritative chain state", () => {
    expect(actionsFor("buyer", "AwaitingPayment", 0n)).toEqual([
      "deposit",
      "cancel",
    ]);
    expect(actionsFor("seller", "RefundRequested", 0n)).toEqual([
      "approveRefund",
      "openDispute",
    ]);
    expect(actionsFor("arbitrator", "Disputed", 0n)).toEqual([
      "resolveRelease",
      "resolveRefund",
    ]);
    expect(actionsFor("seller", "Complete", 10n)).toEqual(["withdraw"]);
  });
});
