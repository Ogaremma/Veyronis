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
}: {
  detail: AgreementDetails;
  baseUrl: string;
}) {
  const client = useMemo(() => new HttpAgreementCreationClient(baseUrl), [baseUrl]);
  const [submissions, setSubmissions] = useState<WorkEvidenceSubmission[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [requirementId, setRequirementId] = useState("");
  const [value, setValue] = useState("");
  const [contentHash, setContentHash] = useState("");
  const [mimeType, setMimeType] = useState("");
  const [byteSize, setByteSize] = useState("");
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

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      setSubmissions(await client.listWorkEvidence(detail.metadata.id));
    } catch {
      setError("Unable to load work evidence. Try again shortly.");
    } finally {
      setLoading(false);
    }
  }, [client, detail.metadata.id]);

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
        ...(contentHash ? { contentHash } : {}),
        ...(mimeType ? { mimeType } : {}),
        ...(byteSize ? { byteSize } : {}),
      });
      setValue("");
      setContentHash("");
      setMimeType("");
      setByteSize("");
      await load();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Unable to submit work evidence.");
    }
  }

  async function review(
    submissionId: string,
    status: "accepted" | "rejected",
  ) {
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
      setError(reason instanceof Error ? reason.message : "Unable to review work evidence.");
    }
  }

  return (
    <section className="dash-panel work-evidence-panel">
      <span className="dash-eyebrow">DELIVERY & WORK EVIDENCE</span>
      <h2>Application-level evidence</h2>
      <p className="dash-muted">
        Buyers and arbitrators review this evidence manually. Attestcoin/Creditcoin is not used to verify photographs, files, websites, or GitHub work.
      </p>
      {error && <p className="dash-error" role="alert">{error}</p>}
      <div className="work-evidence-layout">
        <div>
          <h3>Requirements</h3>
          {requirements.length === 0 ? (
            <p className="dash-muted">No delivery evidence requirements were defined.</p>
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
          ) : submissions.length === 0 ? (
            <p className="dash-muted">No work evidence has been submitted.</p>
          ) : (
            submissions.map((submission) => (
              <article key={submission.id} className="submission-item">
                <strong>
                  {requirements.find((item) => item.id === submission.requirementId)
                    ?.label ?? "Evidence submission"}
                </strong>
                <p className="dash-mono">{submission.value}</p>
                <small>
                  {submission.submitter} · {submission.status}
                  {submission.reviewNote ? ` · ${submission.reviewNote}` : ""}
                </small>
                {(detail.role === "buyer" || detail.role === "arbitrator") &&
                  submission.status === "submitted" && (
                    <div className="dash-actions">
                      <button className="dash-primary" onClick={() => void review(submission.id, "accepted")}>
                        Accept
                      </button>
                      <button className="dash-action" onClick={() => void review(submission.id, "rejected")}>
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
                  {requirement.label || requirement.kind} · {requirement.deliverableTitle}
                </option>
              ))}
            </select>
          </label>
          <label>
            Hosted URI or value
            <input
              value={value}
              placeholder="https://example.com or hosted file URL"
              onChange={(event) => setValue(event.currentTarget.value)}
            />
          </label>
          <div className="form-two">
            <label>
              Content hash (optional)
              <input
                value={contentHash}
                placeholder="sha256:..."
                onChange={(event) => setContentHash(event.currentTarget.value)}
              />
            </label>
            <label>
              MIME type (optional)
              <input
                value={mimeType}
                placeholder="image/png"
                onChange={(event) => setMimeType(event.currentTarget.value)}
              />
            </label>
          </div>
          <label>
            Byte size (optional)
            <input
              value={byteSize}
              inputMode="numeric"
              placeholder="1024"
              onChange={(event) => setByteSize(event.currentTarget.value)}
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
            Submitting evidence does not release, refund, or resolve escrow funds.
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
    </section>
  );
}
