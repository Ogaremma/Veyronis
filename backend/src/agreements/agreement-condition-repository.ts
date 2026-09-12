import type {
  AgreementConditionStatus,
  AgreementConditionVerification,
} from "@veyronis/shared";
import type { ParameterizedQueryExecutor } from "./agreement-repository.js";

export interface AgreementConditionVerificationRecord
  extends Omit<
    AgreementConditionVerification,
    "verifiedClaimId" | "verifiedAmount" | "failureCode" | "failureMessage" | "verifiedAt"
  > {
  status: Extract<AgreementConditionStatus, "verification_in_progress">;
}

export interface AgreementConditionVerificationUpdate {
  status: Exclude<AgreementConditionStatus, "verification_in_progress">;
  verifiedClaimId?: string;
  verifiedAmount?: string;
  failureCode?: string;
  failureMessage?: string;
  verifiedAt?: string;
  updatedAt: string;
}

export interface AgreementConditionVerificationRepository {
  createVerification(
    verification: AgreementConditionVerificationRecord,
  ): Promise<AgreementConditionVerification>;
  updateVerification(
    id: string,
    update: AgreementConditionVerificationUpdate,
  ): Promise<AgreementConditionVerification | undefined>;
  latestVerification(
    agreementId: string,
  ): Promise<AgreementConditionVerification | undefined>;
}

export class InMemoryAgreementConditionVerificationRepository
  implements AgreementConditionVerificationRepository
{
  private readonly verifications = new Map<string, AgreementConditionVerification>();

  async createVerification(
    verification: AgreementConditionVerificationRecord,
  ): Promise<AgreementConditionVerification> {
    if (this.verifications.has(verification.id))
      throw new Error("Condition verification already exists");
    const stored: AgreementConditionVerification = { ...verification };
    this.verifications.set(verification.id, structuredClone(stored));
    return structuredClone(stored);
  }

  async updateVerification(
    id: string,
    update: AgreementConditionVerificationUpdate,
  ): Promise<AgreementConditionVerification | undefined> {
    const verification = this.verifications.get(id);
    if (!verification) return undefined;
    const updated: AgreementConditionVerification = {
      ...verification,
      status: update.status,
      ...(update.verifiedClaimId ? { verifiedClaimId: update.verifiedClaimId } : {}),
      ...(update.verifiedAmount ? { verifiedAmount: update.verifiedAmount } : {}),
      ...(update.failureCode ? { failureCode: update.failureCode } : {}),
      ...(update.failureMessage ? { failureMessage: update.failureMessage } : {}),
      ...(update.verifiedAt ? { verifiedAt: update.verifiedAt } : {}),
      updatedAt: update.updatedAt,
    };
    this.verifications.set(id, updated);
    return structuredClone(updated);
  }

  async latestVerification(
    agreementId: string,
  ): Promise<AgreementConditionVerification | undefined> {
    const latest = [...this.verifications.values()]
      .filter((verification) => verification.agreementId === agreementId)
      .sort((left, right) => right.submittedAt.localeCompare(left.submittedAt))[0];
    return latest ? structuredClone(latest) : undefined;
  }
}

export class SqlAgreementConditionVerificationRepository
  implements AgreementConditionVerificationRepository
{
  constructor(private readonly database: ParameterizedQueryExecutor) {}

  async createVerification(
    verification: AgreementConditionVerificationRecord,
  ): Promise<AgreementConditionVerification> {
    const result = await this.database.query<Record<string, unknown>>(
      `INSERT INTO agreement_condition_verifications
       (id, agreement_id, submitter, transaction_hash, status, submitted_at, updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
      [
        verification.id,
        verification.agreementId,
        verification.submitter,
        verification.transactionHash,
        verification.status,
        verification.submittedAt,
        verification.updatedAt,
      ],
    );
    return mapVerificationRow(result.rows[0]!);
  }

  async updateVerification(
    id: string,
    update: AgreementConditionVerificationUpdate,
  ): Promise<AgreementConditionVerification | undefined> {
    const result = await this.database.query<Record<string, unknown>>(
      `UPDATE agreement_condition_verifications
       SET status=$2, verified_claim_id=$3, verified_amount=$4, failure_code=$5,
           failure_message=$6, verified_at=$7, updated_at=$8
       WHERE id=$1 RETURNING *`,
      [
        id,
        update.status,
        update.verifiedClaimId ?? null,
        update.verifiedAmount ?? null,
        update.failureCode ?? null,
        update.failureMessage ?? null,
        update.verifiedAt ?? null,
        update.updatedAt,
      ],
    );
    return result.rows[0] ? mapVerificationRow(result.rows[0]) : undefined;
  }

  async latestVerification(
    agreementId: string,
  ): Promise<AgreementConditionVerification | undefined> {
    const result = await this.database.query<Record<string, unknown>>(
      `SELECT * FROM agreement_condition_verifications
       WHERE agreement_id=$1 ORDER BY submitted_at DESC, id LIMIT 1`,
      [agreementId],
    );
    return result.rows[0] ? mapVerificationRow(result.rows[0]) : undefined;
  }
}

function mapVerificationRow(
  row: Record<string, unknown>,
): AgreementConditionVerification {
  return {
    id: String(row.id),
    agreementId: String(row.agreement_id),
    submitter: String(row.submitter),
    transactionHash: String(row.transaction_hash),
    status: row.status as AgreementConditionVerification["status"],
    ...(row.verified_claim_id
      ? { verifiedClaimId: String(row.verified_claim_id) }
      : {}),
    ...(row.verified_amount
      ? { verifiedAmount: String(row.verified_amount) }
      : {}),
    ...(row.failure_code ? { failureCode: String(row.failure_code) } : {}),
    ...(row.failure_message
      ? { failureMessage: String(row.failure_message) }
      : {}),
    submittedAt: new Date(String(row.submitted_at)).toISOString(),
    ...(row.verified_at
      ? { verifiedAt: new Date(String(row.verified_at)).toISOString() }
      : {}),
    updatedAt: new Date(String(row.updated_at)).toISOString(),
  };
}
