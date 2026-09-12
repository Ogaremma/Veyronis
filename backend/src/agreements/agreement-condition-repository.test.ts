import { describe, expect, it } from "vitest";
import {
  InMemoryAgreementConditionVerificationRepository,
  SqlAgreementConditionVerificationRepository,
} from "./agreement-condition-repository.js";
import type { ParameterizedQueryExecutor } from "./agreement-repository.js";

const agreementId = "0x" + "1".repeat(64);
const transactionHash = "0x" + "2".repeat(64);

function record(id: string) {
  return {
    id,
    agreementId,
    submitter: "0x2000000000000000000000000000000000000002",
    transactionHash,
    status: "verification_in_progress" as const,
    submittedAt: new Date(0).toISOString(),
    updatedAt: new Date(0).toISOString(),
  };
}

describe("agreement condition verification repositories", () => {
  it("reuses failed attempts and keeps verified attempts idempotent", async () => {
    const repository = new InMemoryAgreementConditionVerificationRepository();
    const first = await repository.startVerification(record("11111111-1111-4111-8111-111111111111"));
    expect(first.claimed).toBe(true);

    await repository.updateVerification(first.verification.id, {
      status: "verification_failed",
      failureCode: "PROOF_UNAVAILABLE",
      failureMessage: "retry later",
      updatedAt: new Date(1).toISOString(),
    });
    const retry = await repository.startVerification(record("22222222-2222-4222-8222-222222222222"));
    expect(retry).toMatchObject({
      claimed: true,
      verification: {
        id: first.verification.id,
        status: "verification_in_progress",
      },
    });

    await repository.updateVerification(first.verification.id, {
      status: "verified",
      verifiedAmount: "100",
      verifiedAt: new Date(2).toISOString(),
      updatedAt: new Date(2).toISOString(),
    });
    const duplicate = await repository.startVerification(record("33333333-3333-4333-8333-333333333333"));
    expect(duplicate).toMatchObject({
      claimed: false,
      verification: {
        id: first.verification.id,
        status: "verified",
      },
    });
  });

  it("claims retryable SQL rows with an atomic upsert", async () => {
    const calls: Array<{ text: string; values: readonly unknown[] }> = [];
    const row = {
      id: "11111111-1111-4111-8111-111111111111",
      agreement_id: agreementId,
      submitter: "0x2000000000000000000000000000000000000002",
      transaction_hash: transactionHash,
      status: "verification_in_progress",
      submitted_at: new Date(0),
      updated_at: new Date(0),
    };
    const database: ParameterizedQueryExecutor = {
      async query<T>(text: string, values: readonly unknown[]) {
        calls.push({ text, values });
        return { rows: [row] as T[] };
      },
    };
    const repository = new SqlAgreementConditionVerificationRepository(database);
    const result = await repository.startVerification(record("11111111-1111-4111-8111-111111111111"));
    expect(result.claimed).toBe(true);
    expect(calls[0]?.text).toContain("ON CONFLICT (agreement_id, transaction_hash)");
    expect(calls[0]?.text).toContain("status IN ('pending', 'verification_failed')");
  });

  it("returns an existing SQL attempt without claiming in-progress work", async () => {
    const calls: Array<{ text: string; values: readonly unknown[] }> = [];
    const row = {
      id: "11111111-1111-4111-8111-111111111111",
      agreement_id: agreementId,
      submitter: "0x2000000000000000000000000000000000000002",
      transaction_hash: transactionHash,
      status: "verification_in_progress",
      submitted_at: new Date(0),
      updated_at: new Date(0),
    };
    const database: ParameterizedQueryExecutor = {
      async query<T>(text: string, values: readonly unknown[]) {
        calls.push({ text, values });
        if (text.includes("ON CONFLICT")) return { rows: [] };
        return { rows: [row] as T[] };
      },
    };
    const repository = new SqlAgreementConditionVerificationRepository(database);
    const result = await repository.startVerification(record("22222222-2222-4222-8222-222222222222"));
    expect(result).toMatchObject({
      claimed: false,
      verification: { status: "verification_in_progress" },
    });
    expect(calls).toHaveLength(2);
  });
});
