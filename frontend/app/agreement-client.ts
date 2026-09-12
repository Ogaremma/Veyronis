import type {
  AgreementDetails,
  AgreementDraft,
  AgreementMetadata,
  AgreementConditionDetails,
  AgreementConditionVerification,
  WorkEvidenceReview,
  WorkEvidenceSubmission,
  WorkEvidenceSubmissionInput,
} from "@veyronis/shared";

export interface AgreementCreationClient {
  prepare(draft: AgreementDraft): Promise<AgreementMetadata>;
  confirmAndDeploy(id: string): Promise<AgreementMetadata>;
  getAgreement(id: string): Promise<AgreementDetails>;
  listWorkEvidence(id: string): Promise<WorkEvidenceSubmission[]>;
  submitWorkEvidence(
    id: string,
    input: WorkEvidenceSubmissionInput,
  ): Promise<WorkEvidenceSubmission>;
  reviewWorkEvidence(
    id: string,
    submissionId: string,
    review: WorkEvidenceReview,
  ): Promise<WorkEvidenceSubmission>;
  getAgreementCondition(id: string): Promise<AgreementConditionDetails>;
  verifyAgreementCondition(
    id: string,
    transactionHash: string,
  ): Promise<AgreementConditionVerification>;
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
    return this.request<AgreementMetadata>("/agreements", {
      method: "POST",
      body: JSON.stringify(draft),
    });
  }

  async confirmAndDeploy(id: string): Promise<AgreementMetadata> {
    return this.request<AgreementMetadata>(`/agreements/${id}/confirm`, { method: "POST" });
  }

  async getAgreement(id: string): Promise<AgreementDetails> {
    return this.request<AgreementDetails>(`/agreements/${id}`, { method: "GET" });
  }

  async listWorkEvidence(
    id: string,
  ): Promise<WorkEvidenceSubmission[]> {
    return this.request<WorkEvidenceSubmission[]>(
      `/agreements/${id}/work-evidence`,
      { method: "GET" },
    );
  }

  async submitWorkEvidence(
    id: string,
    input: WorkEvidenceSubmissionInput,
  ): Promise<WorkEvidenceSubmission> {
    return this.request<WorkEvidenceSubmission>(
      `/agreements/${id}/work-evidence`,
      { method: "POST", body: JSON.stringify(input) },
    );
  }

  async reviewWorkEvidence(
    id: string,
    submissionId: string,
    review: WorkEvidenceReview,
  ): Promise<WorkEvidenceSubmission> {
    return this.request<WorkEvidenceSubmission>(
      `/agreements/${id}/work-evidence/${submissionId}/review`,
      { method: "POST", body: JSON.stringify(review) },
    );
  }

  async getAgreementCondition(
    id: string,
  ): Promise<AgreementConditionDetails> {
    return this.request<AgreementConditionDetails>(
      `/agreements/${id}/condition`,
      { method: "GET" },
    );
  }

  async verifyAgreementCondition(
    id: string,
    transactionHash: string,
  ): Promise<AgreementConditionVerification> {
    return this.request<AgreementConditionVerification>(
      `/agreements/${id}/condition/verify`,
      { method: "POST", body: JSON.stringify(transactionHash) },
    );
  }

  private async request<TResult>(
    path: string,
    init: RequestInit,
  ): Promise<TResult> {
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
    return response.json() as Promise<TResult>;
  }
}
