import type { IncomingMessage, ServerResponse } from "node:http";
import type { AgreementCreationService } from "./agreement-service.js";

export function createAgreementHttpHandler(service: AgreementCreationService) {
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
): void {
  response.writeHead(status, { "content-type": "application/json", ...corsHeaders() });
  response.end(JSON.stringify(body));
}

function corsHeaders(): Record<string, string> {
  return {
    "access-control-allow-origin": process.env.FRONTEND_ORIGIN ?? "http://127.0.0.1:3000",
    "access-control-allow-methods": "POST, OPTIONS",
    "access-control-allow-headers": "content-type",
  };
}
