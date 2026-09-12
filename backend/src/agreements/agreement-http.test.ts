import { createServer } from "node:http";
import { Wallet, ZeroAddress, id } from "ethers";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { AgreementDiscoveryItem } from "@veyronis/shared";
import { WalletAuthService } from "../auth/wallet-auth.js";
import { AgreementConditionServiceError } from "./agreement-condition-service.js";
import { createAgreementHttpHandler, InMemoryRateLimiter } from "./agreement-http.js";

const buyer = new Wallet(`0x${"11".repeat(32)}`);
const wrongWallet = new Wallet(`0x${"22".repeat(32)}`);
const seller = new Wallet(`0x${"33".repeat(32)}`);
const arbitrator = new Wallet(`0x${"44".repeat(32)}`);
const agreementId = id("agreement");
const draft = {
  buyer: buyer.address,
  seller: "0x3000000000000000000000000000000000000003",
  arbitrator: "0x4000000000000000000000000000000000000004",
  evidenceRegistry: "0x5000000000000000000000000000000000000005",
  requiredAmount: "100",
  agreementNonce: id("nonce"),
  policy: {
    version: 1, evidenceType: id("SOURCE_PAYMENT"), sourceChainKey: 1,
    assetKind: "native", expectedSourceContract: ZeroAddress,
    expectedRecipient: "0x3000000000000000000000000000000000000003",
    expectedAsset: ZeroAddress, expectedSender: buyer.address,
    amountRule: "exact", amount: "100", minSourceBlock: "0", maxSourceBlock: "0",
    calldataSelector: "0x00000000", requireTransferEvent: false,
  },
};

const servers: ReturnType<typeof createServer>[] = [];
afterEach(async () => Promise.all(servers.splice(0).map((server) => new Promise<void>((resolve) => server.close(() => resolve())))));

async function sessionCookie(auth: WalletAuthService, wallet: Wallet): Promise<string> {
  const challenge = auth.createChallenge(wallet.address);
  return `veyronis_session=${auth.verify(wallet.address, await wallet.signMessage(challenge.message))}`;
}

async function setup(limit = 20) {
  const auth = new WalletAuthService("a sufficiently long test secret");
  const stored = { ...draft, id: agreementId, agreementCommitment: id("commitment"), evidencePolicyCommitment: id("policy"), deploymentStatus: "AWAITING_CONFIRMATION", createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
  const service = {
    prepare: vi.fn(async () => ({ agreement: stored, confirmationRequired: true })),
    getAgreement: vi.fn(async () => stored),
    confirmAndDeploy: vi.fn(async () => ({ ...stored, deploymentStatus: "DEPLOYED" })),
  };
  const limiter = () => new InMemoryRateLimiter(limit, 60_000, 2, () => 0);
  const server = createServer(createAgreementHttpHandler(service as never, { auth, appEnv: "local", creationLimiter: limiter(), confirmationLimiter: limiter() }));
  servers.push(server);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Server did not bind");
  return { auth, service, url: `http://127.0.0.1:${address.port}` };
}

async function setupDashboardList() {
  const auth = new WalletAuthService("a sufficiently long test secret");
  const stored = {
    ...draft,
    id: agreementId,
    agreementCommitment: id("commitment"),
    evidencePolicyCommitment: id("policy"),
    deploymentStatus: "DEPLOYED",
    escrowAddress: "0x6000000000000000000000000000000000000006",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  const list = vi.fn(async (address: string) => {
    const participants: Record<string, "buyer" | "seller" | "arbitrator"> = {
      [buyer.address]: "buyer",
      [seller.address]: "seller",
      [arbitrator.address]: "arbitrator",
    };
    const role = participants[address];
    return role ? [{ metadata: stored, role }] : [];
  });
  const details = vi.fn(async (id: string, address: string) => {
    if (id !== agreementId) throw new Error("Agreement not found");
    if (address === wrongWallet.address) throw new Error("Not an agreement participant");
    const participants: Record<string, "buyer" | "seller" | "arbitrator"> = {
      [buyer.address]: "buyer",
      [seller.address]: "seller",
      [arbitrator.address]: "arbitrator",
    };
    const role = participants[address];
    if (!role) throw new Error("Not an agreement participant");
    return { metadata: stored, role, timeline: [], actions: [] };
  });
  const service = { prepare: vi.fn(), getAgreement: vi.fn(), confirmAndDeploy: vi.fn() };
  const server = createServer(createAgreementHttpHandler(service as never, {
    auth,
    appEnv: "local",
    dashboard: { list, details } as never,
  }));
  servers.push(server);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Server did not bind");
  return { auth, details, list, url: `http://127.0.0.1:${address.port}` };
}

async function setupDiscovery() {
  const auth = new WalletAuthService("a sufficiently long test secret");
  const items: AgreementDiscoveryItem[] = [
    {
      id: agreementId,
      escrowAddress: "0x6000000000000000000000000000000000000006",
      buyer: buyer.address,
      seller: seller.address,
      arbitrator: arbitrator.address,
      network: "sepolia",
      requiredAmount: "100",
      state: "AwaitingDelivery",
      createdAt: new Date(0).toISOString(),
      updatedAt: new Date(0).toISOString(),
      status: "live",
    },
    {
      id: id("closed"),
      escrowAddress: "0x7000000000000000000000000000000000000007",
      buyer: buyer.address,
      seller: seller.address,
      arbitrator: arbitrator.address,
      network: "sepolia",
      requiredAmount: "100",
      state: "Complete",
      createdAt: new Date(1).toISOString(),
      updatedAt: new Date(1).toISOString(),
      status: "closed",
    },
  ];
  const listDiscovery = vi.fn(async () => items);
  const details = vi.fn();
  const service = {
    prepare: vi.fn(),
    getAgreement: vi.fn(),
    confirmAndDeploy: vi.fn(),
  };
  const server = createServer(createAgreementHttpHandler(service as never, {
    auth,
    appEnv: "local",
    dashboard: { listDiscovery, details } as never,
  }));
  servers.push(server);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Server did not bind");
  return { auth, details, items, listDiscovery, url: `http://127.0.0.1:${address.port}` };
}

async function setupCondition() {
  const auth = new WalletAuthService("a sufficiently long test secret");
  const details = {
    condition: {
      kind: "external_blockchain_action",
      sourceChainKey: 1,
      assetType: "erc20",
      tokenContract: "0x7000000000000000000000000000000000000007",
      expectedSender: seller.address,
      expectedRecipient: buyer.address,
      amount: "100000000",
      amountRule: "exact",
      requireSuccess: true,
    },
  };
  const verification = {
    id: "11111111-1111-4111-8111-111111111111",
    agreementId,
    submitter: seller.address,
    transactionHash: id("transaction"),
    status: "verified",
    verifiedClaimId: id("claim"),
    verifiedAmount: "100000000",
    submittedAt: new Date(0).toISOString(),
    updatedAt: new Date(0).toISOString(),
  };
  const condition = {
    get: vi.fn(async (id: string, wallet: string) => {
      if (wallet === wrongWallet.address) throw new AgreementConditionServiceError(403, "Wallet is not an agreement participant.");
      return { ...details, verification, agreementId: id };
    }),
    verify: vi.fn(async (id: string, wallet: string, input: unknown) => {
      if (wallet === wrongWallet.address) throw new AgreementConditionServiceError(403, "Wallet is not an agreement participant.");
      if (wallet !== seller.address) throw new AgreementConditionServiceError(403, "Only the agreement seller can submit an external transaction.");
      return { ...verification, transactionHash: input };
    }),
  };
  const service = { prepare: vi.fn(), getAgreement: vi.fn(), confirmAndDeploy: vi.fn() };
  const server = createServer(createAgreementHttpHandler(service as never, {
    auth,
    appEnv: "local",
    dashboard: { list: vi.fn(async () => []) } as never,
    condition: condition as never,
  }));
  servers.push(server);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Server did not bind");
  return { auth, condition, details, url: `http://127.0.0.1:${address.port}` };
}

describe("agreement HTTP authorization", () => {
  it("returns an unauthenticated production health check", async () => {
    const { url } = await setup();
    const response = await fetch(`${url}/health`);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true, service: "veyronis-backend" });
  });

  it("returns 401 for both mutating routes without a session", async () => {
    const { url } = await setup();
    expect((await fetch(`${url}/agreements`, { method: "POST", body: JSON.stringify(draft) })).status).toBe(401);
    expect((await fetch(`${url}/agreements/${agreementId}/confirm`, { method: "POST" })).status).toBe(401);
  });

  it("requires authentication for the persistent agreement list", async () => {
    const { url } = await setupDashboardList();
    const response = await fetch(`${url}/agreements`);
    expect(response.status).toBe(401);
  });

  it("returns the public discovery list to unauthenticated visitors", async () => {
    const { details, items, listDiscovery, url } = await setupDiscovery();
    const response = await fetch(`${url}/agreements/discovery`);

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual(items);
    expect(listDiscovery).toHaveBeenCalledOnce();
    expect(details).not.toHaveBeenCalled();
  });

  it("returns the same public discovery list for participant and non-participant wallets", async () => {
    const { auth, items, url } = await setupDiscovery();
    const cookies = await Promise.all([
      sessionCookie(auth, buyer),
      sessionCookie(auth, seller),
      sessionCookie(auth, arbitrator),
      sessionCookie(auth, wrongWallet),
    ]);

    const responses = await Promise.all(
      cookies.map((cookie) =>
        fetch(`${url}/agreements/discovery`, { headers: { cookie } }),
      ),
    );

    expect(responses.map((response) => response.status)).toEqual([200, 200, 200, 200]);
    await expect(Promise.all(responses.map((response) => response.json()))).resolves.toEqual([
      items,
      items,
      items,
      items,
    ]);
  });

  it("does not expose private agreement data in public discovery", async () => {
    const { url } = await setupDiscovery();
    const response = await fetch(`${url}/agreements/discovery`);
    const body = await response.text();

    for (const forbidden of ["policy", "deliverables", "evidence", "chat", "timeline", "actions", "session"]) {
      expect(body).not.toContain(`"${forbidden}"`);
    }
  });

  it("keeps participant-only agreement details authorization-protected", async () => {
    const { auth, url } = await setupDashboardList();
    const buyerCookie = await sessionCookie(auth, buyer);
    const sellerCookie = await sessionCookie(auth, seller);
    const arbitratorCookie = await sessionCookie(auth, arbitrator);
    const unrelatedCookie = await sessionCookie(auth, wrongWallet);

    expect((await fetch(`${url}/agreements/${agreementId}`)).status).toBe(401);

    const responses = await Promise.all(
      [buyerCookie, sellerCookie, arbitratorCookie, unrelatedCookie].map((cookie) =>
        fetch(`${url}/agreements/${agreementId}`, { headers: { cookie } }),
      ),
    );

    expect(responses.slice(0, 3).map((response) => response.status)).toEqual([200, 200, 200]);
    expect(responses[3]!.status).not.toBe(200);
  });

  it("scopes GET /agreements to the authenticated participant", async () => {
    const { auth, list, url } = await setupDashboardList();
    const buyerCookie = await sessionCookie(auth, buyer);
    const sellerCookie = await sessionCookie(auth, seller);
    const arbitratorCookie = await sessionCookie(auth, arbitrator);
    const unrelatedCookie = await sessionCookie(auth, wrongWallet);

    const buyerResponse = await fetch(`${url}/agreements`, {
      headers: { cookie: buyerCookie },
    });
    const sellerResponse = await fetch(`${url}/agreements`, {
      headers: { cookie: sellerCookie },
    });
    const arbitratorResponse = await fetch(`${url}/agreements`, {
      headers: { cookie: arbitratorCookie },
    });
    const unrelatedResponse = await fetch(`${url}/agreements`, {
      headers: { cookie: unrelatedCookie },
    });
    const spoofedAddressResponse = await fetch(`${url}/agreements?address=${arbitrator.address}`, {
      headers: { cookie: buyerCookie },
    });

    await expect(Promise.all([buyerResponse.json(), sellerResponse.json(), arbitratorResponse.json(), unrelatedResponse.json()])).resolves.toEqual([
      [{ metadata: expect.objectContaining({ id: agreementId }), role: "buyer" }],
      [{ metadata: expect.objectContaining({ id: agreementId }), role: "seller" }],
      [{ metadata: expect.objectContaining({ id: agreementId }), role: "arbitrator" }],
      [],
    ]);
    expect(list).toHaveBeenNthCalledWith(1, buyer.address);
    expect(list).toHaveBeenNthCalledWith(2, seller.address);
    expect(list).toHaveBeenNthCalledWith(3, arbitrator.address);
    expect(list).toHaveBeenNthCalledWith(4, wrongWallet.address);
    expect(spoofedAddressResponse.status).toBe(404);
  });

  it("authenticates and scopes external condition access and submission", async () => {
    const { auth, condition, details, url } = await setupCondition();
    const buyerCookie = await sessionCookie(auth, buyer);
    const sellerCookie = await sessionCookie(auth, seller);
    const arbitratorCookie = await sessionCookie(auth, arbitrator);
    const unrelatedCookie = await sessionCookie(auth, wrongWallet);
    const transactionHash = id("transaction");

    expect((await fetch(`${url}/agreements/${agreementId}/condition`)).status).toBe(401);
    expect((await fetch(`${url}/agreements/${agreementId}/condition/verify`, {
      method: "POST",
      body: JSON.stringify(transactionHash),
    })).status).toBe(401);

    for (const cookie of [buyerCookie, sellerCookie, arbitratorCookie]) {
      const response = await fetch(`${url}/agreements/${agreementId}/condition`, {
        headers: { cookie },
      });
      expect(response.status).toBe(200);
      expect(await response.json()).toMatchObject({
        condition: details.condition,
        verification: { verifiedClaimId: id("claim") },
      });
    }

    expect((await fetch(`${url}/agreements/${agreementId}/condition`, {
      headers: { cookie: unrelatedCookie },
    })).status).toBe(403);
    expect((await fetch(`${url}/agreements/${agreementId}/condition/verify`, {
      method: "POST",
      headers: { cookie: buyerCookie },
      body: JSON.stringify(transactionHash),
    })).status).toBe(403);
    expect((await fetch(`${url}/agreements/${agreementId}/condition/verify`, {
      method: "POST",
      headers: { cookie: unrelatedCookie },
      body: JSON.stringify(transactionHash),
    })).status).toBe(403);

    const sellerResponse = await fetch(`${url}/agreements/${agreementId}/condition/verify`, {
      method: "POST",
      headers: { cookie: sellerCookie },
      body: JSON.stringify(transactionHash),
    });
    expect(sellerResponse.status).toBe(200);
    expect(await sellerResponse.json()).toMatchObject({
      status: "verified",
      verifiedClaimId: id("claim"),
    });
    expect(condition.get).toHaveBeenCalledTimes(4);
    expect(condition.verify).toHaveBeenCalledTimes(3);
  });

  it("returns 403 for the wrong authenticated wallet", async () => {
    const { auth, service, url } = await setup();
    const cookie = await sessionCookie(auth, wrongWallet);
    expect((await fetch(`${url}/agreements`, { method: "POST", headers: { cookie }, body: JSON.stringify(draft) })).status).toBe(403);
    expect((await fetch(`${url}/agreements/${agreementId}/confirm`, { method: "POST", headers: { cookie } })).status).toBe(403);
    expect(service.prepare).not.toHaveBeenCalled();
    expect(service.confirmAndDeploy).not.toHaveBeenCalled();
  });

  it("allows the authenticated buyer into existing service flows", async () => {
    const { auth, service, url } = await setup();
    const cookie = await sessionCookie(auth, buyer);
    expect((await fetch(`${url}/agreements`, { method: "POST", headers: { cookie }, body: JSON.stringify(draft) })).status).toBe(201);
    expect((await fetch(`${url}/agreements/${agreementId}/confirm`, { method: "POST", headers: { cookie } })).status).toBe(200);
    expect(service.prepare).toHaveBeenCalledOnce();
    expect(service.confirmAndDeploy).toHaveBeenCalledOnce();
  });

  it("rate limits creation and confirmation only after normal requests are allowed", async () => {
    const { auth, url } = await setup(2);
    const cookie = await sessionCookie(auth, buyer);
    for (let index = 0; index < 2; index += 1) {
      expect((await fetch(`${url}/agreements`, { method: "POST", headers: { cookie }, body: JSON.stringify(draft) })).status).toBe(201);
      expect((await fetch(`${url}/agreements/${agreementId}/confirm`, { method: "POST", headers: { cookie } })).status).toBe(200);
    }
    expect((await fetch(`${url}/agreements`, { method: "POST", headers: { cookie }, body: JSON.stringify(draft) })).status).toBe(429);
    expect((await fetch(`${url}/agreements/${agreementId}/confirm`, { method: "POST", headers: { cookie } })).status).toBe(429);
  });

  it("keeps limiter state bounded and controllable", () => {
    const limiter = new InMemoryRateLimiter(1, 1000, 2, () => 0);
    limiter.allow("a"); limiter.allow("b"); limiter.allow("c");
    expect(limiter.size).toBe(2);
    limiter.clear();
    expect(limiter.size).toBe(0);
  });
});
