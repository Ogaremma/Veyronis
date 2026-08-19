import type { IncomingMessage, ServerResponse } from "node:http";
import { getAddress } from "ethers";
import type { AgreementCreationService } from "./agreement-service.js";
import type { AgreementDashboardService } from "./dashboard-service.js";
import {
  WalletAuthService,
  expiredSessionCookie,
  readCookie,
  sessionCookie,
} from "../auth/wallet-auth.js";

export function createAgreementHttpHandler(
  service: AgreementCreationService,
  options?: {
    dashboard?: AgreementDashboardService;
    auth?: WalletAuthService;
    appEnv?: string;
    creationLimiter?: InMemoryRateLimiter;
    confirmationLimiter?: InMemoryRateLimiter;
  },
) {
  const creationLimiter = options?.creationLimiter ?? new InMemoryRateLimiter();
  const confirmationLimiter = options?.confirmationLimiter ?? new InMemoryRateLimiter();
  return async (
    request: IncomingMessage,
    response: ServerResponse,
  ): Promise<void> => {
    try {
      if (request.method === "OPTIONS") {
        response.writeHead(204, corsHeaders());
        response.end();
        return;
      }
      if (request.method === "POST" && request.url === "/auth/challenge") {
        const body = (await readJson(request)) as { address?: string };
        if (!options?.auth || !body.address)
          throw new Error("Wallet address required");
        sendJson(response, 200, options.auth.createChallenge(body.address));
        return;
      }
      if (request.method === "POST" && request.url === "/auth/verify") {
        const body = (await readJson(request)) as {
          address?: string;
          signature?: string;
        };
        if (!options?.auth || !body.address || !body.signature)
          throw new Error("Signature required");
        const token = options.auth.verify(body.address, body.signature);
        sendJson(
          response,
          200,
          { address: body.address },
          { "set-cookie": sessionCookie(token, options?.appEnv) },
        );
        return;
      }
      if (request.method === "POST" && request.url === "/auth/logout") {
        sendJson(
          response,
          200,
          { ok: true },
          { "set-cookie": expiredSessionCookie(options?.appEnv) },
        );
        return;
      }
      if (
        options?.dashboard &&
        request.method === "GET" &&
        (request.url === "/agreements" ||
          request.url?.startsWith("/agreements/"))
      ) {
        const session = options.auth?.readSession(
          readCookie(request.headers.cookie, "veyronis_session"),
        );
        if (!session) {
          sendJson(response, 401, { error: "Wallet authentication required" });
          return;
        }
        if (request.url === "/agreements") {
          sendJson(
            response,
            200,
            await options.dashboard.list(session.address),
          );
          return;
        }
        const match = request.url?.match(/^\/agreements\/(0x[a-fA-F0-9]{64})$/);
        if (match?.[1]) {
          sendJson(
            response,
            200,
            await options.dashboard.details(match[1], session.address),
          );
          return;
        }
      }
      if (request.method === "POST" && request.url === "/agreements") {
        const session = authenticatedSession(request, options?.auth, response);
        if (!session) return;
        const body = (await readJson(request)) as { buyer?: unknown };
        if (typeof body.buyer !== "string" || getAddress(body.buyer) !== getAddress(session.address)) {
          sendJson(response, 403, { error: "Authenticated wallet is not the agreement buyer" });
          return;
        }
        if (!creationLimiter.allow(session.address.toLowerCase())) {
          sendJson(response, 429, { error: "Too many agreement creation requests" });
          return;
        }
        const prepared = await service.prepare(body);
        sendJson(response, 201, prepared.agreement);
        return;
      }
      const confirmation =
        request.method === "POST"
          ? request.url?.match(/^\/agreements\/(0x[a-fA-F0-9]{64})\/confirm$/)
          : undefined;
      if (confirmation?.[1]) {
        const session = authenticatedSession(request, options?.auth, response);
        if (!session) return;
        const agreement = await service.getAgreement(confirmation[1]);
        if (!agreement) throw new Error("Agreement metadata not found");
        if (getAddress(agreement.buyer) !== getAddress(session.address)) {
          sendJson(response, 403, { error: "Authenticated wallet is not the agreement buyer" });
          return;
        }
        if (!confirmationLimiter.allow(session.address.toLowerCase())) {
          sendJson(response, 429, { error: "Too many agreement confirmation requests" });
          return;
        }
        sendJson(
          response,
          200,
          await service.confirmAndDeploy(confirmation[1]),
        );
        return;
      }
      sendJson(response, 404, { error: "Not found" });
    } catch {
      sendJson(response, 400, { error: "Agreement request rejected" });
    }
  };
}

function authenticatedSession(
  request: IncomingMessage,
  auth: WalletAuthService | undefined,
  response: ServerResponse,
) {
  const session = auth?.readSession(readCookie(request.headers.cookie, "veyronis_session"));
  if (!session) sendJson(response, 401, { error: "Wallet authentication required" });
  return session;
}

export class InMemoryRateLimiter {
  private readonly entries = new Map<string, { count: number; resetAt: number }>();

  constructor(
    private readonly limit = 20,
    private readonly windowMs = 60_000,
    private readonly maxKeys = 1000,
    private readonly now = () => Date.now(),
  ) {}

  allow(key: string): boolean {
    this.prune();
    const current = this.entries.get(key);
    if (!current) {
      if (this.entries.size >= this.maxKeys) this.entries.delete(this.entries.keys().next().value!);
      this.entries.set(key, { count: 1, resetAt: this.now() + this.windowMs });
      return true;
    }
    if (current.count >= this.limit) return false;
    current.count += 1;
    return true;
  }

  get size(): number {
    return this.entries.size;
  }

  clear(): void {
    this.entries.clear();
  }

  private prune(): void {
    const now = this.now();
    for (const [key, entry] of this.entries) if (entry.resetAt <= now) this.entries.delete(key);
  }
}

async function readJson(request: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of request) {
    const buffer = Buffer.from(chunk);
    size += buffer.length;
    if (size > 64 * 1024) throw new Error("Request body too large");
    chunks.push(buffer);
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

function sendJson(
  response: ServerResponse,
  status: number,
  body: unknown,
  extra: Record<string, string> = {},
): void {
  response.writeHead(status, {
    "content-type": "application/json",
    ...corsHeaders(),
    ...extra,
  });
  response.end(JSON.stringify(body));
}

function corsHeaders(): Record<string, string> {
  return {
    "access-control-allow-origin":
      process.env.FRONTEND_ORIGIN ?? "http://127.0.0.1:3000",
    "access-control-allow-methods": "GET, POST, OPTIONS",
    "access-control-allow-headers": "content-type",
    "access-control-allow-credentials": "true",
  };
}
