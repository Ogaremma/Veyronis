"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import type {
  AgreementConditionDetails,
  AgreementDetails,
} from "@veyronis/shared";
import { HttpAgreementCreationClient } from "../agreement-client";

export function AgreementConditionPanel({
  detail,
  baseUrl,
}: {
  detail: AgreementDetails;
  baseUrl: string;
}) {
  const client = useMemo(() => new HttpAgreementCreationClient(baseUrl), [baseUrl]);
  const [condition, setCondition] = useState<AgreementConditionDetails>();
  const [transactionHash, setTransactionHash] = useState("");
  const [loading, setLoading] = useState(true);
  const [available, setAvailable] = useState(true);
  const [verifying, setVerifying] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      setCondition(await client.getAgreementCondition(detail.metadata.id));
      setAvailable(true);
    } catch (error) {
      setAvailable(false);
      const message = error instanceof Error ? error.message : "";
      if (!message.includes("does not have an external blockchain condition")) {
        setError("Unable to load the external condition. Try again.");
      }
    } finally {
      setLoading(false);
    }
  }, [client, detail.metadata.id]);

  useEffect(() => {
    void load();
  }, [load]);

  async function verify() {
    setError("");
    setVerifying(true);
    try {
      await client.verifyAgreementCondition(
        detail.metadata.id,
        transactionHash,
      );
      setTransactionHash("");
      await load();
    } catch {
      setError("Verification failed. Check the transaction and try again.");
      await load().catch(() => undefined);
    } finally {
      setVerifying(false);
    }
  }

  if (!available) {
    return error ? (
      <section className="dash-panel condition-panel">
        <span className="dash-eyebrow">EXTERNAL BLOCKCHAIN CONDITION</span>
        <p className="dash-error" role="alert">{error}</p>
      </section>
    ) : null;
  }

  const verification = condition?.verification;
  const status = conditionStatusLabel(verification, verifying);

  return (
    <section className="dash-panel condition-panel">
      <span className="dash-eyebrow">EXTERNAL BLOCKCHAIN CONDITION</span>
      <h2>{condition ? conditionTitle(condition) : "Loading condition..."}</h2>
      <p className="dash-muted">
        {verification?.status === "verified"
          ? "Verified through Attestcoin. Verification does not automatically release escrow funds."
          : "Veyronis verifies the specified blockchain action with Attestcoin on Creditcoin. The external transaction is separate from the escrow funding transaction. Verification does not automatically release escrow funds."}
      </p>
      {error && <p className="dash-error" role="alert">{error}</p>}
      {loading && !condition ? (
        <p className="dash-muted">Loading external condition...</p>
      ) : condition ? (
        <>
          <dl className="overview-grid">
            <div>
              <dt>Status</dt>
              <dd><span className="dash-status">{status}</span></dd>
            </div>
            <div>
              <dt>Source blockchain</dt>
              <dd>Chain {condition.condition.sourceChainKey}</dd>
            </div>
            <div>
              <dt>Sender</dt>
              <dd className="dash-mono">{condition.condition.expectedSender}</dd>
            </div>
            <div>
              <dt>Recipient</dt>
              <dd className="dash-mono">{condition.condition.expectedRecipient}</dd>
            </div>
            <div>
              <dt>Asset</dt>
              <dd className="dash-mono">
                {condition.condition.assetType === "erc20"
                  ? condition.condition.tokenContract
                  : "Native asset"}
              </dd>
            </div>
            <div>
              <dt>Amount (base units)</dt>
              <dd>{condition.condition.amount} ({condition.condition.amountRule})</dd>
            </div>
            {verification?.transactionHash && (
              <div>
                <dt>Transaction</dt>
                <dd className="dash-mono">{verification.transactionHash}</dd>
              </div>
            )}
            {verification?.id && (
              <div>
                <dt>Verification ID</dt>
                <dd className="dash-mono">{verification.id}</dd>
              </div>
            )}
            {verification?.verifiedClaimId && (
              <div>
                <dt>Registry claim</dt>
                <dd className="dash-mono">{verification.verifiedClaimId}</dd>
              </div>
            )}
          </dl>
          {verification?.status === "verified" && (
            <ul className="condition-checks">
              <li>✓ Transaction included</li>
              <li>✓ Transaction succeeded</li>
              <li>✓ Sender matched</li>
              <li>✓ Recipient matched</li>
              <li>✓ {condition.condition.assetType === "erc20" ? "Token matched" : "Asset matched"}</li>
              <li>✓ Amount matched</li>
            </ul>
          )}
          {verification?.status === "verification_failed" && (
            <p className="dash-error">{failureLabel(verification.failureCode)}</p>
          )}
          {canSubmitCondition(detail.role, verification) && (
            <div className="submission-form">
              <h3>Submit transaction hash</h3>
              <label>
                External transaction hash
                <input
                  value={transactionHash}
                  placeholder="0x..."
                  onChange={(event) => setTransactionHash(event.currentTarget.value)}
                />
              </label>
              <button
                className="dash-primary"
                disabled={verifying || transactionHash.length !== 66}
                onClick={() => void verify()}
              >
                {verifying
                  ? "Verifying..."
                  : verification?.failureCode === "PROOF_UNAVAILABLE"
                    ? "Retry verification"
                    : "Submit transaction hash"}
              </button>
            </div>
          )}
        </>
      ) : null}
    </section>
  );
}

export function conditionTitle(details: AgreementConditionDetails) {
  const asset = details.condition.assetType === "erc20"
    ? "token transfer"
    : "native transfer";
  return `External blockchain action: ${asset}`;
}

export function conditionStatusLabel(
  verification: AgreementConditionDetails["verification"],
  verifying = false,
) {
  if (verifying) return "Verification in progress";
  if (verification?.status === "verified") return "Verified";
  if (
    verification?.status === "verification_failed" &&
    verification.failureCode === "PROOF_UNAVAILABLE"
  ) {
    return "Proof unavailable";
  }
  if (verification?.status === "verification_failed") return "Verification failed";
  return "Pending";
}

export function canSubmitCondition(
  role: AgreementDetails["role"],
  verification: AgreementConditionDetails["verification"],
) {
  return role === "seller" && verification?.status !== "verified";
}

export function failureLabel(code: string | undefined) {
  if (code === "PROOF_UNAVAILABLE")
    return "The blockchain transaction is confirmed, but the cross-chain proof is not available yet. Wait for attestation and try again.";
  if (code === "SUBJECT_MISMATCH") return "The verified sender did not match the condition.";
  if (code === "WRONG_RECIPIENT" || code === "WRONG_CALLDATA") return "The verified recipient did not match the condition.";
  if (code === "WRONG_ASSET") return "The verified token did not match the condition.";
  if (code === "WRONG_AMOUNT") return "The verified amount did not match the condition.";
  if (code === "WRONG_EVENT") return "The verified transaction did not succeed or did not contain the required transfer.";
  return "The external blockchain condition was not verified.";
}
