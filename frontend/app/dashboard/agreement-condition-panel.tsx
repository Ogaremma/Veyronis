"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import type {
  AgreementConditionDetails,
  AgreementDetails,
} from "@veyronis/shared";
import {
  agreementLifecycleMode,
  canWithdrawEscrowFunds,
  conditionVerificationProviders,
  externalBlockchainConditionFromPolicy,
} from "@veyronis/shared";
import { formatEther } from "ethers";
import { HttpAgreementCreationClient } from "../agreement-client";
import { StatusBadge } from "../ui/glass";

export function AgreementConditionPanel({
  detail,
  baseUrl,
  onVerificationChange,
  onSettlementChange,
}: {
  detail: AgreementDetails;
  baseUrl: string;
  onVerificationChange?: (
    verification: AgreementConditionDetails["verification"],
  ) => void;
  onSettlementChange?: () => Promise<void> | void;
}) {
  const client = useMemo(
    () => new HttpAgreementCreationClient(baseUrl),
    [baseUrl],
  );
  const [condition, setCondition] = useState<AgreementConditionDetails>();
  const [transactionHash, setTransactionHash] = useState("");
  const [loading, setLoading] = useState(true);
  const [available, setAvailable] = useState(true);
  const [verifying, setVerifying] = useState(false);
  const [error, setError] = useState("");
  const configured = useMemo(
    () =>
      externalBlockchainConditionFromPolicy(detail.metadata.policy) !==
      undefined,
    [detail.metadata.policy],
  );

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const nextCondition = await client.getAgreementCondition(
        detail.metadata.id,
      );
      setCondition(nextCondition);
      onVerificationChange?.(nextCondition.verification);
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
    if (!configured) {
      setAvailable(false);
      setLoading(false);
      onVerificationChange?.(undefined);
      return;
    }
    void load();
  }, [configured, load]);

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
      await onSettlementChange?.();
    } catch {
      setError("Verification failed. Check the transaction and try again.");
      await load().catch(() => undefined);
    } finally {
      setVerifying(false);
    }
  }

  if (!configured) return null;

  if (!available) {
    return error ? (
      <section className="dash-panel condition-panel">
        <span className="dash-eyebrow">EXTERNAL BLOCKCHAIN CONDITION</span>
        <p className="dash-error" role="alert">
          {error}
        </p>
      </section>
    ) : null;
  }

  const verification = condition?.verification;
  const status = conditionStatusLabel(verification, verifying);
  const chain = detail.chain;
  const verifiedOnChain = isVerifiedOnChain(detail, verification);
  const lifecycle = agreementLifecycleMode(detail.metadata);
  const sellerSettled = isEscrowPaymentUnlocked(detail, verification);
  const sellerWithdrawable =
    detail.role === "seller" &&
    chain !== undefined &&
    canWithdrawEscrowFunds(detail.role, chain.state, chain.withdrawalAmount);

  return (
    <section className="dash-panel condition-panel">
      <span className="dash-eyebrow">EXTERNAL BLOCKCHAIN CONDITION</span>
      <h2>{condition ? conditionTitle(condition) : "Loading condition..."}</h2>
      {verifiedOnChain && (
        <div className="verified-on-chain">
          <div>
            <span className="verification-pulse" aria-hidden="true" />
            <strong>VERIFIED ON-CHAIN</strong>
          </div>
          <p>
            {sellerSettled
              ? "Attestcoin/Creditcoin verified that the required blockchain transaction satisfies this agreement’s condition. The authorized claim was accepted and the escrow credited the seller."
              : "Attestcoin/Creditcoin verified that the required blockchain transaction satisfies this agreement’s condition. The authorized claim was recorded; buyer acceptance is still required."}
          </p>
          <strong className="provider-truth">
            {condition
              ? verificationProviderLabel(condition, true)
              : "Verified by Attestcoin + Creditcoin"}
          </strong>
        </div>
      )}
      <p className="dash-muted">
        {verifiedOnChain
          ? "The seller explicitly withdraws after contract credit. The withdrawable amount below comes from the escrow contract, not from verification status alone."
          : "Submitting a transaction hash only starts Attestcoin/Creditcoin verification. A hash alone can never unlock or transfer escrow funds."}
      </p>
      {error && (
        <p className="dash-error" role="alert">
          {error}
        </p>
      )}
      {loading && !condition ? (
        <p className="dash-muted">Loading external condition...</p>
      ) : condition ? (
        <>
          <ol
            className="condition-path"
            aria-label="External condition progression"
          >
            {conditionSummarySteps(detail, verification).map((step) => (
              <li className={step.tone} key={step.label}>
                <span>{step.status}</span>
                <strong>{step.label}</strong>
              </li>
            ))}
          </ol>
          <dl className="overview-grid">
            <div>
              <dt>Status</dt>
              <dd>
                <StatusBadge
                  tone={
                    status === "Verified on-chain"
                      ? "green"
                      : status === "Verification failed" ||
                          status === "Proof unavailable"
                        ? "red"
                        : "blue"
                  }
                >
                  {status}
                </StatusBadge>
              </dd>
            </div>
            <div>
              <dt>Provider truth</dt>
              <dd>
                {verificationProviderLabel(
                  condition,
                  verification?.status === "verified",
                )}
              </dd>
            </div>
            <div>
              <dt>Seller settlement</dt>
              <dd>
                <StatusBadge
                  tone={
                    sellerSettled ? "green" : verifiedOnChain ? "amber" : "blue"
                  }
                >
                  {sellerSettled
                    ? "Credited by escrow"
                    : verifiedOnChain
                      ? lifecycle === "hybrid"
                        ? "Awaiting buyer acceptance"
                        : "Claim not accepted by escrow"
                      : claimSettlementStatus(verification)}
                </StatusBadge>
              </dd>
            </div>
            <div>
              <dt>Payment status</dt>
              <dd>{externalPaymentStatus(detail, verification).label}</dd>
            </div>
            {sellerWithdrawable && chain && (
              <div>
                <dt>Withdrawable by seller</dt>
                <dd>{formatEther(chain.withdrawalAmount)} ETH</dd>
              </div>
            )}
            <div>
              <dt>Source blockchain</dt>
              <dd>{sourceChainLabel(condition.condition.sourceChainKey)}</dd>
            </div>
            <div>
              <dt>Sender</dt>
              <dd className="dash-mono">
                {condition.condition.expectedSender}
              </dd>
            </div>
            <div>
              <dt>Recipient</dt>
              <dd className="dash-mono">
                {condition.condition.expectedRecipient}
              </dd>
            </div>
            <div>
              <dt>Asset</dt>
              <dd className="dash-mono">{assetLabel(condition.condition)}</dd>
            </div>
            <div>
              <dt>Required amount</dt>
              <dd>
                {conditionAmountLabel(condition.condition)} (
                {amountRuleLabel(condition.condition.amountRule)})
              </dd>
            </div>
            {verification?.transactionHash && (
              <div>
                <dt>Transaction</dt>
                <dd className="dash-mono">{verification.transactionHash}</dd>
              </div>
            )}
            {verification?.verifiedAmount && (
              <div>
                <dt>Verified amount</dt>
                <dd>{verification.verifiedAmount} base units</dd>
              </div>
            )}
            {verification?.verifiedAt && (
              <div>
                <dt>Verified at</dt>
                <dd>{new Date(verification.verifiedAt).toLocaleString()}</dd>
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
          {verification?.verifiedFacts && (
            <details className="technical-details verified-facts" open>
              <summary>Verified facts</summary>
              <dl>
                <div>
                  <dt>Transaction hash</dt>
                  <dd className="dash-mono">
                    {verification.verifiedFacts.sourceTransactionHash}
                  </dd>
                </div>
                <div>
                  <dt>Source chain / ID</dt>
                  <dd>
                    {verification.verifiedFacts.sourceChainKey} /{" "}
                    {verification.verifiedFacts.chainId}
                  </dd>
                </div>
                <div>
                  <dt>Source block</dt>
                  <dd>{verification.verifiedFacts.sourceBlockNumber}</dd>
                </div>
                <div>
                  <dt>Sender</dt>
                  <dd className="dash-mono">
                    {verification.verifiedFacts.sender}
                  </dd>
                </div>
                <div>
                  <dt>Recipient</dt>
                  <dd className="dash-mono">
                    {verification.verifiedFacts.recipient}
                  </dd>
                </div>
                <div>
                  <dt>Asset</dt>
                  <dd className="dash-mono">
                    {verification.verifiedFacts.asset}
                  </dd>
                </div>
                <div>
                  <dt>Amount</dt>
                  <dd>{verification.verifiedFacts.amount} base units</dd>
                </div>
                <div>
                  <dt>Transaction inclusion</dt>
                  <dd>Confirmed</dd>
                </div>
                <div>
                  <dt>Transaction success</dt>
                  <dd>Confirmed</dd>
                </div>
                <div>
                  <dt>Condition match</dt>
                  <dd>Confirmed</dd>
                </div>
              </dl>
            </details>
          )}
          <ol className="verification-pipeline condition-stages">
            {conditionVerificationStages(detail, verification).map((stage) => (
              <li className={stage.tone} key={stage.label}>
                <span>{stage.index}</span>
                <div>
                  <strong>{stage.label}</strong>
                  <p>{stage.status}</p>
                </div>
              </li>
            ))}
          </ol>
          <details className="technical-details">
            <summary>Technical details</summary>
            <dl>
              <div>
                <dt>Source chain key</dt>
                <dd>{condition.condition.sourceChainKey}</dd>
              </div>
              <div>
                <dt>EVM chain ID</dt>
                <dd>{verification?.verifiedFacts?.chainId ?? "11155111"}</dd>
              </div>
              <div>
                <dt>Raw amount</dt>
                <dd className="dash-mono">
                  {condition.condition.amount} base units
                </dd>
              </div>
              {condition.condition.tokenContract && (
                <div>
                  <dt>Token contract</dt>
                  <dd className="dash-mono">
                    {condition.condition.tokenContract}
                  </dd>
                </div>
              )}
            </dl>
          </details>
          {verification?.status === "verified" && (
            <ul className="condition-checks">
              <li>✓ Transaction included</li>
              <li>✓ Transaction succeeded</li>
              <li>✓ Sender matched</li>
              <li>✓ Recipient matched</li>
              <li>
                ✓{" "}
                {condition.condition.assetType === "erc20"
                  ? "Token matched"
                  : "Asset matched"}
              </li>
              <li>✓ Amount matched</li>
            </ul>
          )}
          {verification?.status === "verification_failed" && (
            <p className="dash-error">
              {failureLabel(verification.failureCode)}
            </p>
          )}
          {canSubmitCondition(detail.role, verification) &&
            detail.chain?.state === "AwaitingDelivery" && (
              <div className="submission-form">
                <h3>Submit transaction hash</h3>
                <label>
                  External transaction hash
                  <input
                    value={transactionHash}
                    placeholder="0x..."
                    onChange={(event) =>
                      setTransactionHash(event.currentTarget.value)
                    }
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
  const asset =
    details.condition.assetType === "erc20"
      ? "token transfer"
      : "native transfer";
  return `External blockchain condition: ${asset}`;
}

export function verificationProviderLabel(
  details: AgreementConditionDetails,
  verified = false,
) {
  const providers = details.verificationProviders.length
    ? details.verificationProviders
    : conditionVerificationProviders;
  const names =
    providers.length > 1 ? providers.join(" + ") : providers.join("");
  return verified ? `Verified by ${names}` : names;
}

export function isVerifiedOnChain(
  detail: AgreementDetails,
  verification: AgreementConditionDetails["verification"],
) {
  return (
    verification?.status === "verified" &&
    verification.verifiedClaimId !== undefined &&
    detail.chain?.verifiedClaimId === verification.verifiedClaimId
  );
}

export function externalPaymentStatus(
  detail: AgreementDetails,
  verification: AgreementConditionDetails["verification"],
): { label: string; tone: "blue" | "green" | "amber" | "red" } {
  const lifecycle = agreementLifecycleMode(detail.metadata);
  const paymentUnlocked = isEscrowPaymentUnlocked(detail, verification);
  if (hasTimelineEvent(detail, "Withdrawn"))
    return { label: "Withdrawn", tone: "green" };
  if (
    detail.role === "seller" &&
    detail.chain &&
    canWithdrawEscrowFunds(
      detail.role,
      detail.chain.state,
      detail.chain.withdrawalAmount,
    )
  ) {
    return { label: "Unlocked — withdrawal available", tone: "green" };
  }
  if (paymentUnlocked) return { label: "Unlocked", tone: "green" };
  if (
    verification?.status === "verification_failed" &&
    verification.failureCode === "PROOF_UNAVAILABLE"
  ) {
    return { label: "Locked — proof unavailable", tone: "red" };
  }
  if (verification?.status === "verification_failed")
    return { label: "Locked — verification failed", tone: "red" };
  if (verification?.status === "verification_in_progress")
    return { label: "Locked — verification pending", tone: "amber" };
  if (verification?.status === "verified") {
    if (!isVerifiedOnChain(detail, verification))
      return { label: "Locked — claim not accepted", tone: "amber" };
    if (lifecycle === "hybrid")
      return { label: "Locked — buyer acceptance required", tone: "amber" };
  }
  return { label: "Locked — awaiting transaction hash", tone: "blue" };
}

export function claimSettlementStatus(
  verification: AgreementConditionDetails["verification"],
) {
  if (verification?.status === "verification_in_progress")
    return "Authorized claim not submitted";
  if (verification?.status === "verification_failed")
    return "No authorized claim";
  return "Waiting for prerequisites";
}

export function conditionSummarySteps(
  detail: AgreementDetails,
  verification: AgreementConditionDetails["verification"],
) {
  const paymentUnlocked = isEscrowPaymentUnlocked(detail, verification);
  const withdrawn = hasTimelineEvent(detail, "Withdrawn");
  return [
    {
      label: "Transaction submitted",
      status: verification ? "Complete" : "Current",
      tone: verification ? "complete" : "current",
    },
    {
      label: "Verified on-chain",
      status: isVerifiedOnChain(detail, verification)
        ? "Complete"
        : verification?.status === "verification_failed"
          ? "Failed"
          : "Pending",
      tone: isVerifiedOnChain(detail, verification)
        ? "complete"
        : verification?.status === "verification_failed"
          ? "failed"
          : "pending",
    },
    {
      label: "Payment unlocked",
      status: paymentUnlocked ? "Complete" : "Pending",
      tone: paymentUnlocked ? "complete" : "pending",
    },
    {
      label: "Withdraw",
      status: withdrawn ? "Complete" : "Pending",
      tone: withdrawn ? "complete" : "pending",
    },
  ];
}

export function conditionVerificationStages(
  detail: AgreementDetails,
  verification: AgreementConditionDetails["verification"],
) {
  const verified = verification?.status === "verified";
  const verifiedOnChain = isVerifiedOnChain(detail, verification);
  const paymentUnlocked = isEscrowPaymentUnlocked(detail, verification);
  const withdrawalAvailable =
    detail.role === "seller" &&
    detail.chain !== undefined &&
    canWithdrawEscrowFunds(
      detail.role,
      detail.chain.state,
      detail.chain.withdrawalAmount,
    );
  const withdrawn = hasTimelineEvent(detail, "Withdrawn");
  return [
    stage(
      1,
      "Transaction hash submitted",
      verification ? "Complete" : "Waiting for seller",
      verification ? "complete" : "current",
    ),
    stage(
      2,
      "Proof requested",
      verification ? "Complete" : "Not started",
      verification ? "complete" : "pending",
    ),
    stage(
      3,
      "Proof unavailable or pending",
      verification?.status === "verification_failed" &&
        verification.failureCode === "PROOF_UNAVAILABLE"
        ? "Proof unavailable"
        : verification?.status === "verification_failed"
          ? "Verification failed"
          : verification
            ? "Waiting for provider proof"
            : "Not started",
      verification?.status === "verification_failed"
        ? "failed"
        : verification
          ? "current"
          : "pending",
    ),
    stage(
      4,
      "Proof received",
      verified ? "Complete" : "Not received yet",
      verified ? "complete" : "pending",
    ),
    stage(
      5,
      "Proof validated",
      verified ? "Complete" : "Not validated yet",
      verified ? "complete" : "pending",
    ),
    stage(
      6,
      "Authorized claim submitted",
      verifiedOnChain ? "Complete" : "Not submitted",
      verifiedOnChain ? "complete" : "pending",
    ),
    stage(
      7,
      "Escrow payment unlocked",
      paymentUnlocked
        ? "Complete"
        : externalPaymentStatus(detail, verification).label,
      paymentUnlocked ? "complete" : "pending",
    ),
    stage(
      8,
      "Seller withdrawal available",
      withdrawalAvailable ? "Available" : "Not available",
      withdrawalAvailable ? "complete" : "pending",
    ),
    stage(
      9,
      "Seller withdrawn",
      withdrawn ? "Complete" : "Pending",
      withdrawn ? "complete" : "pending",
    ),
  ];
}

function stage(
  index: number,
  label: string,
  status: string,
  tone: "complete" | "current" | "pending" | "failed",
) {
  return { index, label, status, tone };
}

function isEscrowPaymentUnlocked(
  detail: AgreementDetails,
  verification: AgreementConditionDetails["verification"],
) {
  const lifecycle = agreementLifecycleMode(detail.metadata);
  return (
    isVerifiedOnChain(detail, verification) &&
    detail.chain?.state === "Complete" &&
    (lifecycle === "blockchain_condition_only" ||
      detail.chain.withdrawalAmount !== "0" ||
      hasTimelineEvent(detail, "WithdrawalCredited"))
  );
}

function hasTimelineEvent(detail: AgreementDetails, name: string) {
  return detail.timeline.some((event) => event.name === name);
}

export function hasExternalBlockchainCondition(detail: AgreementDetails) {
  return (
    externalBlockchainConditionFromPolicy(detail.metadata.policy) !== undefined
  );
}

function sourceChainLabel(sourceChainKey: number) {
  return sourceChainKey === 1
    ? "Sepolia (key 1 · chain ID 11155111)"
    : `Chain key ${sourceChainKey}`;
}

function assetLabel(condition: AgreementConditionDetails["condition"]) {
  return condition.assetType === "erc20"
    ? (condition.tokenContract ?? "ERC-20 token")
    : "Native ETH on Sepolia";
}

function conditionAmountLabel(
  condition: AgreementConditionDetails["condition"],
) {
  if (condition.assetType !== "native")
    return `${condition.amount} token units`;
  try {
    return `${formatEther(condition.amount)} ETH`;
  } catch {
    return `${condition.amount} base units`;
  }
}

function amountRuleLabel(
  rule: AgreementConditionDetails["condition"]["amountRule"],
) {
  return rule === "exact" ? "exact" : "minimum";
}

export function conditionStatusLabel(
  verification: AgreementConditionDetails["verification"],
  verifying = false,
) {
  if (verifying) return "Verification in progress";
  if (verification?.status === "verified") return "Verified on-chain";
  if (
    verification?.status === "verification_failed" &&
    verification.failureCode === "PROOF_UNAVAILABLE"
  ) {
    return "Proof unavailable";
  }
  if (verification?.status === "verification_failed")
    return "Verification failed";
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
  if (code === "SUBJECT_MISMATCH")
    return "The verified sender did not match the condition.";
  if (code === "WRONG_RECIPIENT" || code === "WRONG_CALLDATA")
    return "The verified recipient did not match the condition.";
  if (code === "WRONG_ASSET")
    return "The verified token did not match the condition.";
  if (code === "WRONG_AMOUNT")
    return "The verified amount did not match the condition.";
  if (code === "WRONG_EVENT")
    return "The verified transaction did not succeed or did not contain the required transfer.";
  return "The external blockchain condition was not verified.";
}
