import type {
  WorkEvidenceReview,
  WorkEvidenceSubmission,
} from "@veyronis/shared";
import type { ParameterizedQueryExecutor } from "./agreement-repository.js";

export interface WorkEvidenceSubmissionRecord
  extends Omit<WorkEvidenceSubmission, "status" | "reviewNote" | "reviewedAt"> {
  status: "submitted";
}

export interface WorkEvidenceRepository {
  createSubmission(
    submission: WorkEvidenceSubmissionRecord,
  ): Promise<WorkEvidenceSubmission>;
  listSubmissions(agreementId: string): Promise<WorkEvidenceSubmission[]>;
  getSubmission(id: string): Promise<WorkEvidenceSubmission | undefined>;
  reviewSubmission(
    id: string,
    review: Required<Pick<WorkEvidenceReview, "status">> &
      Pick<WorkEvidenceReview, "reviewNote"> & {
        reviewedAt: string;
        updatedAt: string;
      },
  ): Promise<WorkEvidenceSubmission | undefined>;
}

export class InMemoryWorkEvidenceRepository
  implements WorkEvidenceRepository
{
  private readonly submissions = new Map<string, WorkEvidenceSubmission>();

  async createSubmission(
    submission: WorkEvidenceSubmissionRecord,
  ): Promise<WorkEvidenceSubmission> {
    if (this.submissions.has(submission.id))
      throw new Error("Evidence submission already exists");
    const stored: WorkEvidenceSubmission = { ...submission };
    this.submissions.set(submission.id, structuredClone(stored));
    return structuredClone(stored);
  }

  async listSubmissions(
    agreementId: string,
  ): Promise<WorkEvidenceSubmission[]> {
    return [...this.submissions.values()]
      .filter((submission) => submission.agreementId === agreementId)
      .sort((left, right) => left.submittedAt.localeCompare(right.submittedAt))
      .map((submission) => structuredClone(submission));
  }

  async getSubmission(
    id: string,
  ): Promise<WorkEvidenceSubmission | undefined> {
    const submission = this.submissions.get(id);
    return submission ? structuredClone(submission) : undefined;
  }

  async reviewSubmission(
    id: string,
    review: Required<Pick<WorkEvidenceReview, "status">> &
      Pick<WorkEvidenceReview, "reviewNote"> & {
        reviewedAt: string;
        updatedAt: string;
      },
  ): Promise<WorkEvidenceSubmission | undefined> {
    const submission = this.submissions.get(id);
    if (!submission) return undefined;
    const updated: WorkEvidenceSubmission = {
      ...submission,
      status: review.status,
      ...(review.reviewNote ? { reviewNote: review.reviewNote } : {}),
      reviewedAt: review.reviewedAt,
      updatedAt: review.updatedAt,
    };
    this.submissions.set(id, updated);
    return structuredClone(updated);
  }
}

export class SqlWorkEvidenceRepository implements WorkEvidenceRepository {
  constructor(private readonly database: ParameterizedQueryExecutor) {}

  async createSubmission(
    submission: WorkEvidenceSubmissionRecord,
  ): Promise<WorkEvidenceSubmission> {
    const result = await this.database.query<Record<string, unknown>>(
      `INSERT INTO agreement_evidence_submissions
       (id, agreement_id, requirement_id, submitter, value, content_hash, mime_type, byte_size,
        status, submitted_at, updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *`,
      [
        submission.id,
        submission.agreementId,
        submission.requirementId,
        submission.submitter,
        submission.value,
        submission.contentHash ?? null,
        submission.mimeType ?? null,
        submission.byteSize ?? null,
        submission.status,
        submission.submittedAt,
        submission.updatedAt,
      ],
    );
    return mapSubmissionRow(result.rows[0]!);
  }

  async listSubmissions(
    agreementId: string,
  ): Promise<WorkEvidenceSubmission[]> {
    const result = await this.database.query<Record<string, unknown>>(
      "SELECT * FROM agreement_evidence_submissions WHERE agreement_id = $1 ORDER BY submitted_at, id",
      [agreementId],
    );
    return result.rows.map(mapSubmissionRow);
  }

  async getSubmission(
    id: string,
  ): Promise<WorkEvidenceSubmission | undefined> {
    const result = await this.database.query<Record<string, unknown>>(
      "SELECT * FROM agreement_evidence_submissions WHERE id = $1 LIMIT 1",
      [id],
    );
    return result.rows[0] ? mapSubmissionRow(result.rows[0]) : undefined;
  }

  async reviewSubmission(
    id: string,
    review: Required<Pick<WorkEvidenceReview, "status">> &
      Pick<WorkEvidenceReview, "reviewNote"> & {
        reviewedAt: string;
        updatedAt: string;
      },
  ): Promise<WorkEvidenceSubmission | undefined> {
    const result = await this.database.query<Record<string, unknown>>(
      `UPDATE agreement_evidence_submissions
       SET status=$2, review_note=$3, reviewed_at=$4, updated_at=$5
       WHERE id=$1 AND status='submitted' RETURNING *`,
      [
        id,
        review.status,
        review.reviewNote ?? null,
        review.reviewedAt,
        review.updatedAt,
      ],
    );
    return result.rows[0] ? mapSubmissionRow(result.rows[0]) : undefined;
  }
}

function mapSubmissionRow(row: Record<string, unknown>): WorkEvidenceSubmission {
  return {
    id: String(row.id),
    agreementId: String(row.agreement_id),
    requirementId: String(row.requirement_id),
    submitter: String(row.submitter),
    value: String(row.value),
    ...(row.content_hash ? { contentHash: String(row.content_hash) } : {}),
    ...(row.mime_type ? { mimeType: String(row.mime_type) } : {}),
    ...(row.byte_size ? { byteSize: String(row.byte_size) } : {}),
    status: row.status as WorkEvidenceSubmission["status"],
    ...(row.review_note ? { reviewNote: String(row.review_note) } : {}),
    submittedAt: new Date(String(row.submitted_at)).toISOString(),
    ...(row.reviewed_at
      ? { reviewedAt: new Date(String(row.reviewed_at)).toISOString() }
      : {}),
    updatedAt: new Date(String(row.updated_at)).toISOString(),
  };
}
