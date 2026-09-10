import { createServer } from "node:http";
import { Wallet, id } from "ethers";
import { afterEach, describe, expect, it, vi } from "vitest";
import { WalletAuthService } from "../auth/wallet-auth.js";
import { createAgreementHttpHandler } from "./agreement-http.js";
import { WorkEvidenceServiceError } from "./work-evidence-service.js";

const buyer = new Wallet(`0x${"11".repeat(32)}`);
const seller = new Wallet(`0x${"22".repeat(32)}`);
const arbitrator = new Wallet(`0x${"33".repeat(32)}`);
const unrelated = new Wallet(`0x${"44".repeat(32)}`);
const agreementId = id("agreement");
const submissionId = "11111111-1111-4111-8111-111111111111";
const requirementId = "22222222-2222-4222-8222-222222222222";

const servers: ReturnType<typeof createServer>[] = [];
afterEach(async () => Promise.all(servers.splice(0).map((server) => new Promise<void>((resolve) => server.close(() => resolve())))));

async function sessionCookie(auth: WalletAuthService, wallet: Wallet): Promise<string> {
  const challenge = auth.createChallenge(wallet.address);
  return `veyronis_session=${auth.verify(wallet.address, await wallet.signMessage(challenge.message))}`;
}

async function setup() {
  const auth = new WalletAuthService("a sufficiently long test secret");
  const workEvidence = {
    list: vi.fn(async (_agreementId: string, wallet: string) => {
      if (![buyer.address, seller.address, arbitrator.address].includes(wallet))
        throw new WorkEvidenceServiceError(403, "Wallet is not an agreement participant.");
      return [];
    }),
    submit: vi.fn(async () => ({
      id: submissionId,
      agreementId,
      requirementId,
      submitter: seller.address,
      value: "https://example.com",
      status: "submitted",
      submittedAt: new Date(0).toISOString(),
      updatedAt: new Date(0).toISOString(),
    })),
    review: vi.fn(async () => ({
      id: submissionId,
      agreementId,
      requirementId,
      submitter: seller.address,
      value: "https://example.com",
      status: "accepted",
      submittedAt: new Date(0).toISOString(),
      reviewedAt: new Date(1).toISOString(),
      updatedAt: new Date(1).toISOString(),
    })),
  };
  const server = createServer(createAgreementHttpHandler({} as never, {
    auth,
    appEnv: "local",
    dashboard: { list: vi.fn() } as never,
    workEvidence: workEvidence as never,
  }));
  servers.push(server);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Server did not bind");
  return { auth, url: `http://127.0.0.1:${address.port}`, workEvidence };
}

describe("work evidence HTTP routes", () => {
  it("requires wallet authentication", async () => {
    const { url } = await setup();
    expect((await fetch(`${url}/agreements/${agreementId}/work-evidence`)).status).toBe(401);
    expect((await fetch(`${url}/agreements/${agreementId}/work-evidence`, {
      method: "POST",
      body: JSON.stringify({ requirementId, value: "https://example.com" }),
    })).status).toBe(401);
    expect((await fetch(`${url}/agreements/${agreementId}/work-evidence/${submissionId}/review`, {
      method: "POST",
      body: JSON.stringify({ status: "accepted" }),
    })).status).toBe(401);
  });

  it("submits and reviews work evidence through separate application routes", async () => {
    const { auth, url, workEvidence } = await setup();
    const sellerCookie = await sessionCookie(auth, seller);
    const buyerCookie = await sessionCookie(auth, buyer);
    const arbitratorCookie = await sessionCookie(auth, arbitrator);
    const unrelatedCookie = await sessionCookie(auth, unrelated);

    const submissionResponse = await fetch(`${url}/agreements/${agreementId}/work-evidence`, {
      method: "POST",
      credentials: "include",
      headers: { cookie: sellerCookie, "content-type": "application/json" },
      body: JSON.stringify({ requirementId, value: "https://example.com" }),
    });
    expect(submissionResponse.status).toBe(200);
    expect(workEvidence.submit).toHaveBeenCalledWith(
      agreementId,
      seller.address,
      { requirementId, value: "https://example.com" },
    );

    await expect(fetch(`${url}/agreements/${agreementId}/work-evidence`, {
      headers: { cookie: buyerCookie },
    })).resolves.toMatchObject({ status: 200 });
    await expect(fetch(`${url}/agreements/${agreementId}/work-evidence`, {
      headers: { cookie: arbitratorCookie },
    })).resolves.toMatchObject({ status: 200 });
    await expect(fetch(`${url}/agreements/${agreementId}/work-evidence`, {
      headers: { cookie: unrelatedCookie },
    })).resolves.toMatchObject({ status: 403 });

    const reviewResponse = await fetch(
      `${url}/agreements/${agreementId}/work-evidence/${submissionId}/review`,
      {
        method: "POST",
        credentials: "include",
        headers: { cookie: buyerCookie, "content-type": "application/json" },
        body: JSON.stringify({ status: "accepted" }),
      },
    );
    expect(reviewResponse.status).toBe(200);
    expect(workEvidence.review).toHaveBeenCalledWith(
      agreementId,
      submissionId,
      buyer.address,
      { status: "accepted" },
    );
  });
});
