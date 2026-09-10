import { afterEach, describe, expect, it, vi } from "vitest";
import type { AgreementDraft, AgreementMetadata } from "@veyronis/shared";
import { HttpAgreementCreationClient } from "./agreement-client";

const draft = {} as AgreementDraft;
const metadata = { id: "0x1" } as AgreementMetadata;

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("agreement creation client", () => {
  it("includes the wallet session cookie for both authenticated requests", async () => {
    const fetchMock = vi.fn().mockImplementation(() => Promise.resolve(jsonResponse(200, metadata)));
    vi.stubGlobal("fetch", fetchMock);
    const client = new HttpAgreementCreationClient("https://backend.example");

    await expect(client.prepare(draft)).resolves.toEqual(metadata);
    await expect(client.confirmAndDeploy(metadata.id)).resolves.toEqual(metadata);

    expect(fetchMock).toHaveBeenNthCalledWith(1, "https://backend.example/agreements", {
      method: "POST",
      body: JSON.stringify(draft),
      credentials: "include",
      headers: { "content-type": "application/json" },
    });
    expect(fetchMock).toHaveBeenNthCalledWith(2, "https://backend.example/agreements/0x1/confirm", {
      method: "POST",
      credentials: "include",
      headers: { "content-type": "application/json" },
    });
  });

  it("surfaces safe backend error messages", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse(401, {
      error: "Wallet authentication required",
    })));
    const client = new HttpAgreementCreationClient("https://backend.example");

    await expect(client.prepare(draft)).rejects.toThrow("Wallet authentication required");
  });

  it("explains invalid drafts when the backend returns a generic rejection", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse(400, {
      error: "Agreement request rejected",
    })));
    const client = new HttpAgreementCreationClient("https://backend.example");

    await expect(client.confirmAndDeploy(metadata.id)).rejects.toThrow(
      "Invalid agreement draft. Check the participant addresses, amount, and evidence policy.",
    );
  });

  it("does not expose infrastructure details from backend errors", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse(500, {
      message: "postgres://user:secret@example.internal/db",
    })));
    const client = new HttpAgreementCreationClient("https://backend.example");

    await expect(client.prepare(draft)).rejects.toThrow("Agreement service is unavailable. Please try again shortly.");
  });

  it("uses a safe fallback when the backend response is not JSON", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("Service unavailable", { status: 503 })));
    const client = new HttpAgreementCreationClient("https://backend.example");

    await expect(client.confirmAndDeploy(metadata.id)).rejects.toThrow("Agreement service is unavailable. Please try again shortly.");
  });
});
