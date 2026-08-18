import type { IncomingMessage, ServerResponse } from "node:http";
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
  options?: { dashboard?: AgreementDashboardService; auth?: WalletAuthService },
) {
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
          { "set-cookie": sessionCookie(token) },
        );
        return;
      }
      if (request.method === "POST" && request.url === "/auth/logout") {
        sendJson(
          response,
          200,
          { ok: true },
          { "set-cookie": expiredSessionCookie },
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
        const prepared = await service.prepare(await readJson(request));
        sendJson(response, 201, prepared.agreement);
        return;
      }
      const confirmation =
        request.method === "POST"
          ? request.url?.match(/^\/agreements\/(0x[a-fA-F0-9]{64})\/confirm$/)
          : undefined;
      if (confirmation?.[1]) {
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
