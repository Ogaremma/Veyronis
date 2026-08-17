import type { AgreementDraft, AgreementMetadata } from "@veyronis/shared";

export interface AgreementCreationClient {
  prepare(draft: AgreementDraft): Promise<AgreementMetadata>;
  confirmAndDeploy(id: string): Promise<AgreementMetadata>;
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
    const response = await fetch(`${this.baseUrl}${path}`, {
      ...init,
      headers: { "content-type": "application/json" },
    });
    if (!response.ok) throw new Error("Agreement orchestration request failed");
    return response.json() as Promise<AgreementMetadata>;
  }
}
