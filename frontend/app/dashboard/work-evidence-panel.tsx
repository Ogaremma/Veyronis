"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import type {
  AgreementDetails,
  WorkEvidenceSubmission,
} from "@veyronis/shared";
import { HttpAgreementCreationClient } from "../agreement-client";

export function WorkEvidencePanel({
  detail,
  baseUrl,
  onSubmissionsChange,
}: {
  detail: AgreementDetails;
  baseUrl: string;
  onSubmissionsChange?: (submissions: WorkEvidenceSubmission[]) => void;
}) {
  const client = useMemo(
    () => new HttpAgreementCreationClient(baseUrl),
    [baseUrl],
  );
  const [submissions, setSubmissions] = useState<WorkEvidenceSubmission[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [requirementId, setRequirementId] = useState("");
  const [value, setValue] = useState("");
  const [reviewNote, setReviewNote] = useState("");

  const requirements = useMemo(
    () =>
      (detail.metadata.deliverables ?? [])
        .filter((deliverable) => deliverable.active)
        .flatMap((deliverable) =>
          deliverable.evidenceRequirements.map((requirement) => ({
            ...requirement,
            deliverableTitle: deliverable.title,
          })),
        ),
    [detail.metadata.deliverables],
  );
  const currentSubmissions = useMemo(
    () => currentWorkEvidenceSubmissions(submissions),
    [submissions],
  );

  const load = useCallback(async () => {
    if (!hasWorkEvidenceRequirements(detail)) {
      setSubmissions([]);
      setLoading(false);
      onSubmissionsChange?.([]);
      return;
    }
    setLoading(true);
    setError("");
    try {
      const nextSubmissions = await client.listWorkEvidence(detail.metadata.id);
      setSubmissions(nextSubmissions);
      onSubmissionsChange?.(nextSubmissions);
    } catch {
      setError("Unable to load work evidence. Try again shortly.");
    } finally {
      setLoading(false);
    }
  }, [client, detail]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!requirementId && requirements.length > 0)
      setRequirementId(requirements[0]!.id);
  }, [requirementId, requirements]);

  async function submit() {
    setError("");
    try {
      await client.submitWorkEvidence(detail.metadata.id, {
        requirementId,
        value,
      });
      setValue("");
      await load();
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "Unable to submit work evidence.",
      );
    }
  }

  async function review(submissionId: string, status: "accepted" | "rejected") {
    setError("");
    try {
      await client.reviewWorkEvidence(
        detail.metadata.id,
        submissionId,
        status === "rejected" && reviewNote
          ? { status, reviewNote }
          : { status },
      );
      setReviewNote("");
      await load();
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "Unable to review work evidence.",
      );
    }
  }

  if (!hasWorkEvidenceRequirements(detail)) return null;

  const selectedRequirement = requirements.find(
    (requirement) => requirement.id === requirementId,
  );

  return (
    <section className="dash-panel work-evidence-panel">
      <span className="dash-eyebrow">DELIVERY & WORK EVIDENCE</span>
      <h2>Application-level evidence</h2>
      <p className="dash-muted">
        Buyers and arbitrators review this evidence manually.
        Attestcoin/Creditcoin is not used to verify photographs, files,
        websites, or GitHub work.
      </p>
      {error && (
        <p className="dash-error" role="alert">
          {error}
        </p>
      )}
      <div className="work-evidence-layout">
        <div>
          <h3>Requirements</h3>
          {requirements.length === 0 ? (
            <p className="dash-muted">
              No delivery evidence requirements were defined.
            </p>
          ) : (
            requirements.map((requirement) => (
              <div key={requirement.id} className="requirement-list-item">
                <strong>{requirement.label || "Unnamed requirement"}</strong>
                <small>
                  {requirement.kind.replaceAll("_", " ")} ·{" "}
                  {requirement.required ? "Required" : "Optional"} ·{" "}
                  {requirement.deliverableTitle || "Untitled deliverable"}
                </small>
              </div>
            ))
          )}
        </div>
        <div>
          <h3>Submissions</h3>
          {loading ? (
            <p className="dash-muted">Loading work evidence...</p>
          ) : currentSubmissions.length === 0 ? (
            <p className="dash-muted">No work evidence has been submitted.</p>
          ) : (
            currentSubmissions.map((submission) => (
              <article key={submission.id} className="submission-item">
                <strong>
                  {requirements.find(
                    (item) => item.id === submission.requirementId,
                  )?.label ?? "Evidence submission"}
                </strong>
                <p className="dash-mono">{submission.value}</p>
                <small>
                  {submission.submitter} · {submission.status}
                  {submission.reviewNote ? ` · ${submission.reviewNote}` : ""}
                </small>
                {(detail.role === "buyer" || detail.role === "arbitrator") &&
                  submission.status === "submitted" && (
                    <div className="dash-actions">
                      <button
                        className="dash-primary"
                        onClick={() => void review(submission.id, "accepted")}
                      >
                        Accept
                      </button>
                      <button
                        className="dash-action"
                        onClick={() => void review(submission.id, "rejected")}
                      >
                        Reject
                      </button>
                    </div>
                  )}
              </article>
            ))
          )}
        </div>
      </div>
      {detail.role === "seller" && (
        <div className="submission-form">
          <h3>Submit evidence</h3>
          <label>
            Requirement
            <select
              value={requirementId}
              onChange={(event) => setRequirementId(event.currentTarget.value)}
            >
              {requirements.map((requirement) => (
                <option key={requirement.id} value={requirement.id}>
                  {requirement.label || requirement.kind} ·{" "}
                  {requirement.deliverableTitle}
                </option>
              ))}
            </select>
          </label>
          <label>
            {evidenceValueLabel(selectedRequirement?.kind)}
            <input
              value={value}
              placeholder={evidenceValuePlaceholder(selectedRequirement?.kind)}
              onChange={(event) => setValue(event.currentTarget.value)}
            />
          </label>
          <button
            className="dash-primary"
            disabled={!requirementId || !value}
            onClick={() => void submit()}
          >
            Submit work evidence
          </button>
          <p className="dash-muted">
            Submitting evidence does not release, refund, or resolve escrow
            funds.
          </p>
        </div>
      )}
      {(detail.role === "buyer" || detail.role === "arbitrator") && (
        <label className="review-note">
          Review note for rejection (optional)
          <input
            value={reviewNote}
            placeholder="Explain why this evidence is insufficient."
            onChange={(event) => setReviewNote(event.currentTarget.value)}
          />
        </label>
      )}
      <p className="dash-muted current-evidence-note">
        Shows the current submission for each requirement. Earlier submissions
        remain retained in the historical database record.
      </p>
    </section>
  );
}

export function currentWorkEvidenceSubmissions(
  submissions: readonly WorkEvidenceSubmission[],
): WorkEvidenceSubmission[] {
  const latest = new Map<string, WorkEvidenceSubmission>();
  for (const submission of [...submissions].sort((left, right) => {
    const leftTime = Date.parse(left.submittedAt);
    const rightTime = Date.parse(right.submittedAt);
    return leftTime - rightTime || left.id.localeCompare(right.id);
  })) {
    latest.set(submission.requirementId, submission);
  }
  return [...latest.values()].sort((left, right) => {
    const leftTime = Date.parse(left.submittedAt);
    const rightTime = Date.parse(right.submittedAt);
    return leftTime - rightTime || left.id.localeCompare(right.id);
  });
}

export function hasWorkEvidenceRequirements(detail: AgreementDetails) {
  return (detail.metadata.deliverables ?? []).some(
    (deliverable) =>
      deliverable.active && deliverable.evidenceRequirements.length > 0,
  );
}

function evidenceValueLabel(kind: string | undefined) {
  if (kind === "TEXT") return "Evidence text";
  if (kind === "TRANSACTION_HASH") return "Transaction hash";
  if (kind === "GITHUB_COMMIT") return "Commit URL";
  if (kind === "GITHUB_REPOSITORY") return "Repository URL";
  return "Evidence URL";
}

function evidenceValuePlaceholder(kind: string | undefined) {
  if (kind === "TEXT") return "Describe or paste the requested evidence";
  if (kind === "TRANSACTION_HASH") return "0x...";
  if (kind === "GITHUB_COMMIT") return "https://github.com/...";
  if (kind === "GITHUB_REPOSITORY")
    return "https://github.com/organization/repository";
  return "https://example.com/evidence";
}
