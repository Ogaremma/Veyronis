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

export interface AgreementConditionVerificationStart {
  verification: AgreementConditionVerification;
  claimed: boolean;
}

export interface AgreementConditionVerificationRepository {
  startVerification(
    verification: AgreementConditionVerificationRecord,
  ): Promise<AgreementConditionVerificationStart>;
  updateVerification(
    id: string,
    update: AgreementConditionVerificationUpdate,
  ): Promise<AgreementConditionVerification | undefined>;
  findVerifiedTransaction(
    transactionHash: string,
  ): Promise<AgreementConditionVerification | undefined>;
  latestVerification(
    agreementId: string,
  ): Promise<AgreementConditionVerification | undefined>;
}

export class InMemoryAgreementConditionVerificationRepository
  implements AgreementConditionVerificationRepository
{
  private readonly verifications = new Map<string, AgreementConditionVerification>();

  async startVerification(
    verification: AgreementConditionVerificationRecord,
  ): Promise<AgreementConditionVerificationStart> {
    const existing = this.findVerification(
      verification.agreementId,
      verification.transactionHash,
    );
    if (existing) {
      if (
        existing.status === "verified" ||
        existing.status === "verification_in_progress"
      ) {
        return { verification: structuredClone(existing), claimed: false };
      }
      const {
        verifiedClaimId,
        verifiedAmount,
        failureCode,
        failureMessage,
        verifiedAt,
        ...restartable
      } = existing;
      const restarted: AgreementConditionVerification = {
        ...restartable,
        status: "verification_in_progress",
        updatedAt: verification.updatedAt,
      };
      this.verifications.set(restarted.id, restarted);
      return { verification: structuredClone(restarted), claimed: true };
    }
    const stored: AgreementConditionVerification = { ...verification };
    this.verifications.set(verification.id, structuredClone(stored));
    return { verification: structuredClone(stored), claimed: true };
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
      ...(update.verifiedClaimId !== undefined
        ? { verifiedClaimId: update.verifiedClaimId }
        : {}),
      ...(update.verifiedAmount !== undefined
        ? { verifiedAmount: update.verifiedAmount }
        : {}),
      ...(update.failureCode !== undefined
        ? { failureCode: update.failureCode }
        : {}),
      ...(update.failureMessage !== undefined
        ? { failureMessage: update.failureMessage }
        : {}),
      ...(update.verifiedAt !== undefined
        ? { verifiedAt: update.verifiedAt }
        : {}),
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

  async findVerifiedTransaction(
    transactionHash: string,
  ): Promise<AgreementConditionVerification | undefined> {
    const verified = [...this.verifications.values()].find(
      (verification) =>
        verification.status === "verified" &&
        verification.transactionHash.toLowerCase() ===
          transactionHash.toLowerCase(),
    );
    return verified ? structuredClone(verified) : undefined;
  }

  private findVerification(
    agreementId: string,
    transactionHash: string,
  ): AgreementConditionVerification | undefined {
    return [...this.verifications.values()].find(
      (verification) =>
        verification.agreementId === agreementId &&
        verification.transactionHash.toLowerCase() ===
          transactionHash.toLowerCase(),
    );
  }
}

export class SqlAgreementConditionVerificationRepository
  implements AgreementConditionVerificationRepository
{
  constructor(private readonly database: ParameterizedQueryExecutor) {}

  async startVerification(
    verification: AgreementConditionVerificationRecord,
  ): Promise<AgreementConditionVerificationStart> {
    const result = await this.database.query<Record<string, unknown>>(
      `INSERT INTO agreement_condition_verifications
       (id, agreement_id, submitter, transaction_hash, status, submitted_at, updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7)
       ON CONFLICT (agreement_id, transaction_hash)
       DO UPDATE SET status='verification_in_progress',
         verified_claim_id=NULL,
         verified_amount=NULL,
         failure_code=NULL,
         failure_message=NULL,
         verified_at=NULL,
         updated_at=EXCLUDED.updated_at
       WHERE agreement_condition_verifications.status IN ('pending', 'verification_failed')
       RETURNING *`,
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
    if (result.rows[0]) {
      return {
        verification: mapVerificationRow(result.rows[0]),
        claimed: true,
      };
    }
    const existing = await this.getVerification(
      verification.agreementId,
      verification.transactionHash,
    );
    if (!existing) throw new Error("Condition verification could not be started");
    return { verification: existing, claimed: false };
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

  async findVerifiedTransaction(
    transactionHash: string,
  ): Promise<AgreementConditionVerification | undefined> {
    const result = await this.database.query<Record<string, unknown>>(
      `SELECT * FROM agreement_condition_verifications
       WHERE transaction_hash=$1 AND status='verified' LIMIT 1`,
      [transactionHash],
    );
    return result.rows[0] ? mapVerificationRow(result.rows[0]) : undefined;
  }

  private async getVerification(
    agreementId: string,
    transactionHash: string,
  ): Promise<AgreementConditionVerification | undefined> {
    const result = await this.database.query<Record<string, unknown>>(
      `SELECT * FROM agreement_condition_verifications
       WHERE agreement_id=$1 AND transaction_hash=$2`,
      [agreementId, transactionHash],
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
