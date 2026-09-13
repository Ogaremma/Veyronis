import { describe, expect, it, vi } from "vitest";
import { restoreWalletSession } from "./session-restoration";

const address = "0x1000000000000000000000000000000000000001";

describe("wallet session restoration", () => {
  it("restores a matching authenticated session without signing", async () => {
    const fetchImpl = vi.fn(async () => jsonResponse(200, { address }));
    await expect(restoreWalletSession({ address, baseUrl: "https://api.test", fetchImpl })).resolves.toBe(address);
    expect(fetchImpl).toHaveBeenCalledWith("https://api.test/auth/session", { credentials: "include" });
  });

  it("does not restore an invalid, missing, mismatched, or unavailable session", async () => {
    await expect(restoreWalletSession({
      address,
      baseUrl: "https://api.test",
      fetchImpl: vi.fn(async () => jsonResponse(401, {})),
    })).resolves.toBeUndefined();
    await expect(restoreWalletSession({
      address,
      baseUrl: "https://api.test",
      fetchImpl: vi.fn(async () => jsonResponse(200, { address: address.toUpperCase() })),
    })).resolves.toBe(address);
    await expect(restoreWalletSession({
      address,
      baseUrl: "https://api.test",
      fetchImpl: vi.fn(async () => jsonResponse(200, { address: "0x2000000000000000000000000000000000000002" })),
    })).resolves.toBeUndefined();
    await expect(restoreWalletSession({
      address,
      baseUrl: "https://api.test",
      fetchImpl: vi.fn(async () => { throw new Error("offline"); }),
    })).resolves.toBeUndefined();
  });
});

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}
