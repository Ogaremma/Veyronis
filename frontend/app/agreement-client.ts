import type { AgreementDraft, AgreementMetadata } from "@veyronis/shared";

export interface AgreementCreationClient {
  prepare(draft: AgreementDraft): Promise<AgreementMetadata>;
  confirmAndDeploy(id: string): Promise<AgreementMetadata>;
}

async function agreementRequestErrorMessage(response: Response): Promise<string> {
  let body: unknown;
  try {
    body = await response.json();
  } catch {
    body = undefined;
  }
  const backendMessage = safeBackendMessage(body);
  if (backendMessage) return backendMessage;
  if (response.status === 400 || response.status === 422) {
    return "Invalid agreement draft. Check the participant addresses, amount, and evidence policy.";
  }
  if (response.status === 401) return "Wallet authentication required. Reconnect your wallet and try again.";
  if (response.status === 429) return "Rate limited. Wait a minute before trying again.";
  if (response.status >= 500) return "Agreement service is unavailable. Please try again shortly.";
  return `Agreement request failed with status ${response.status}.`;
}

function safeBackendMessage(body: unknown): string | undefined {
  if (typeof body !== "object" || body === null) return undefined;
  const message = "error" in body && typeof body.error === "string" && body.error.trim()
    ? body.error.trim()
    : "message" in body && typeof body.message === "string" && body.message.trim()
      ? body.message.trim()
      : undefined;
  if (!message || message.length > 160) return undefined;
  if (/(private key|api key|secret|password|token|stack trace|postgres(?:ql)?:\/\/|https?:\/\/|[A-Za-z]:\\)/i.test(message)) {
    return undefined;
  }
  if (message === "Agreement request rejected") {
    return "Invalid agreement draft. Check the participant addresses, amount, and evidence policy.";
  }
  return message;
}

export class HttpAgreementCreationClient implements AgreementCreationClient {
  constructor(private readonly baseUrl: string) {}

  async prepare(draft: AgreementDraft): Promise<AgreementMetadata> {
    return this.request("/agreements", {
      method: "POST",
      body: JSON.stringify(draft),
    });
  }

  async confirmAndDeploy(id: string): Promise<AgreementMetadata> {
    return this.request(`/agreements/${id}/confirm`, { method: "POST" });
  }

  private async request(
    path: string,
    init: RequestInit,
  ): Promise<AgreementMetadata> {
    let response: Response;
    try {
      response = await fetch(`${this.baseUrl}${path}`, {
        ...init,
        credentials: "include",
        headers: { "content-type": "application/json" },
      });
    } catch {
      throw new Error("Unable to reach the agreement service. Check your connection and try again.");
    }
    if (!response.ok) throw new Error(await agreementRequestErrorMessage(response));
    return response.json() as Promise<AgreementMetadata>;
  }
}
