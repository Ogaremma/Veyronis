"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import type {
  AgreementAction,
  AgreementConditionDetails,
  AgreementDetails,
} from "@veyronis/shared";
import {
  agreementLifecycleMode,
  canWithdrawEscrowFunds,
  externalBlockchainConditionFromPolicy,
} from "@veyronis/shared";
import {
  BrowserProvider,
  Contract,
  formatEther,
  formatUnits,
  type Eip1193Provider,
} from "ethers";
import { HttpAgreementCreationClient } from "../agreement-client";
import { StatusBadge } from "../ui/glass";

export interface TokenMetadata {
  symbol: string;
  decimals: number;
}

const verificationProviderName = "Attestcoin Protocol on Creditcoin";
const tokenMetadataFallbacks: Record<string, TokenMetadata> = {
  "0x1c7d4b196cb0c7b01d743fbc6116a902379c7238": {
    symbol: "USDC",
    decimals: 6,
  },
};

export function AgreementConditionPanel({
  detail,
  baseUrl,
  onVerificationChange,
  onSettlementChange,
  executeAction,
  actionBusy = false,
}: {
  detail: AgreementDetails;
  baseUrl: string;
  onVerificationChange?: (
    verification: AgreementConditionDetails["verification"],
  ) => void;
  onSettlementChange?: () => Promise<void> | void;
  executeAction?: (action: AgreementAction) => void;
  actionBusy?: boolean;
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
  const [tokenMetadata, setTokenMetadata] = useState<TokenMetadata>();
  const [copiedValue, setCopiedValue] = useState("");
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

  const tokenContract = condition?.condition.tokenContract;
  useEffect(() => {
    if (!tokenContract) {
      setTokenMetadata(undefined);
      return;
    }
    let active = true;
    if (typeof window === "undefined" || !window.ethereum) {
      setTokenMetadata(tokenMetadataFallback(tokenContract));
      return;
    }
    const provider = new BrowserProvider(
      window.ethereum as unknown as Eip1193Provider,
    );
    void resolveTokenMetadata(tokenContract, provider)
      .then((metadata) => {
        if (active) setTokenMetadata(metadata);
      })
      .catch(() => {
        if (active) setTokenMetadata(tokenMetadataFallback(tokenContract));
      });
    return () => {
      active = false;
    };
  }, [tokenContract]);

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
  const chain = detail.chain;
  const verifiedOnChain = isVerifiedOnChain(detail, verification);
  const status = conditionStatusLabel(verification, verifying, verifiedOnChain);
  const lifecycle = agreementLifecycleMode(detail.metadata);
  const sellerSettled = isEscrowPaymentUnlocked(detail, verification);
  const sellerWithdrawable =
    detail.role === "seller" &&
    chain !== undefined &&
    canWithdrawEscrowFunds(detail.role, chain.state, chain.withdrawalAmount);
  const activeTokenMetadata = tokenContract
    ? (tokenMetadata ?? tokenMetadataFallback(tokenContract))
    : undefined;

  async function copyValue(value: string) {
    try {
      await navigator.clipboard.writeText(value);
      setCopiedValue(value);
    } catch {
      setCopiedValue("");
    }
  }

  return (
    <section className="dash-panel condition-panel">
      <span className="dash-eyebrow">EXTERNAL BLOCKCHAIN CONDITION</span>
      <h2>EXTERNAL BLOCKCHAIN CONDITION</h2>
      {verifiedOnChain && (
        <div className="verified-on-chain">
          <div>
            <span className="verification-pulse" aria-hidden="true" />
            <strong>VERIFIED ON-CHAIN</strong>
          </div>
          <p>
            {sellerSettled
              ? "Attestcoin Protocol on Creditcoin verified the required blockchain transaction. The authorized claim was accepted and the escrow credited the seller’s internal withdrawal balance; it has not yet paid the seller’s wallet."
              : "Attestcoin Protocol on Creditcoin verified the required blockchain transaction. The authorized claim was recorded; the escrow has not accepted it yet."}
          </p>
          <strong className="provider-truth">
            {condition
              ? verificationProviderLabel(condition, true)
              : `Verified by ${verificationProviderName}`}
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
          {lifecycle === "blockchain_condition_only" ? (
            <div className="condition-card-grid">
              <article className="condition-card">
                <h3>Source transaction</h3>
                <dl>
                  <div>
                    <dt>Transaction hash</dt>
                    <dd className="copy-field">
                      {verification?.transactionHash ? (
                        <>
                          <span className="dash-mono">
                            {shortAddress(verification.transactionHash)}
                          </span>
                          <button
                            type="button"
                            onClick={() =>
                              void copyValue(verification.transactionHash!)
                            }
                          >
                            {copiedValue === verification.transactionHash
                              ? "Copied"
                              : "Copy"}
                          </button>
                        </>
                      ) : (
                        "Not submitted"
                      )}
                    </dd>
                  </div>
                  <div>
                    <dt>Source chain</dt>
                    <dd>
                      {sourceChainLabel(condition.condition.sourceChainKey)}
                    </dd>
                  </div>
                  <div>
                    <dt>Source block</dt>
                    <dd>
                      {verification?.verifiedFacts?.sourceBlockNumber ??
                        "Pending proof"}
                    </dd>
                  </div>
                  <div>
                    <dt>Sender</dt>
                    <dd className="copy-field">
                      <span className="dash-mono">
                        {shortAddress(condition.condition.expectedSender)}
                      </span>
                      <button
                        type="button"
                        onClick={() =>
                          void copyValue(condition.condition.expectedSender)
                        }
                      >
                        {copiedValue === condition.condition.expectedSender
                          ? "Copied"
                          : "Copy"}
                      </button>
                    </dd>
                  </div>
                  <div>
                    <dt>Recipient</dt>
                    <dd className="copy-field">
                      <span className="dash-mono">
                        {shortAddress(condition.condition.expectedRecipient)}
                      </span>
                      <button
                        type="button"
                        onClick={() =>
                          void copyValue(condition.condition.expectedRecipient)
                        }
                      >
                        {copiedValue === condition.condition.expectedRecipient
                          ? "Copied"
                          : "Copy"}
                      </button>
                    </dd>
                  </div>
                  <div>
                    <dt>Asset</dt>
                    <dd>
                      {assetLabel(condition.condition, activeTokenMetadata)}
                    </dd>
                  </div>
                  {condition.condition.tokenContract && (
                    <div>
                      <dt>Token contract</dt>
                      <dd className="copy-field">
                        <span className="dash-mono">
                          {shortAddress(condition.condition.tokenContract)}
                        </span>
                        <button
                          type="button"
                          onClick={() =>
                            void copyValue(condition.condition.tokenContract!)
                          }
                        >
                          {copiedValue === condition.condition.tokenContract
                            ? "Copied"
                            : "Copy"}
                        </button>
                      </dd>
                    </div>
                  )}
                  <div>
                    <dt>Required amount</dt>
                    <dd>
                      {conditionAmountLabel(
                        condition.condition,
                        activeTokenMetadata,
                      )}
                    </dd>
                  </div>
                  <div>
                    <dt>Raw amount</dt>
                    <dd>{condition.condition.amount} units</dd>
                  </div>
                </dl>
              </article>
              <article className="condition-card">
                <h3>Proof &amp; attestation</h3>
                <dl>
                  <div>
                    <dt>Status</dt>
                    <dd>
                      <StatusBadge
                        tone={
                          status === "Verified on-chain"
                            ? "green"
                            : status === "Waiting for Creditcoin attestation"
                              ? "amber"
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
                    <dt>Verification provider</dt>
                    <dd>{verificationProviderName}</dd>
                  </div>
                  {verification?.status === "verification_failed" && (
                    <div>
                      <dt>Failure reason</dt>
                      <dd>{failureLabel(verification.failureCode)}</dd>
                    </div>
                  )}
                  {verification?.verifiedAt && (
                    <div>
                      <dt>Verified at</dt>
                      <dd>
                        {new Date(verification.verifiedAt).toLocaleString()}
                      </dd>
                    </div>
                  )}
                  {verification?.verifiedClaimId && (
                    <div>
                      <dt>Registry claim</dt>
                      <dd className="copy-field">
                        <span className="dash-mono">
                          {shortAddress(verification.verifiedClaimId)}
                        </span>
                        <button
                          type="button"
                          onClick={() =>
                            void copyValue(verification.verifiedClaimId!)
                          }
                        >
                          {copiedValue === verification.verifiedClaimId
                            ? "Copied"
                            : "Copy"}
                        </button>
                      </dd>
                    </div>
                  )}
                </dl>
              </article>
              <article className="condition-card">
                <h3>Payment settlement</h3>
                <dl>
                  <div>
                    <dt>Payment status</dt>
                    <dd>
                      <StatusBadge
                        tone={externalPaymentStatus(detail, verification).tone}
                      >
                        {externalPaymentStatus(detail, verification).label}
                      </StatusBadge>
                    </dd>
                  </div>
                  <div>
                    <dt>Seller settlement</dt>
                    <dd>
                      {sellerSettled
                        ? "Credited by escrow"
                        : claimSettlementStatus(verification)}
                    </dd>
                  </div>
                  <div>
                    <dt>Contract state</dt>
                    <dd>{chain?.state ?? "Not deployed"}</dd>
                  </div>
                </dl>
                {detail.actions.includes("deposit") && executeAction && (
                  <button
                    className="dash-primary"
                    type="button"
                    disabled={actionBusy}
                    onClick={() => executeAction("deposit")}
                  >
                    Fund Contract{" "}
                    {chain ? formatEther(chain.requiredAmount) : ""} ETH
                  </button>
                )}
              </article>
              {sellerWithdrawable && chain && (
                <article className="condition-card withdrawal-card">
                  <h3>Seller withdrawal</h3>
                  <strong>
                    {formatEther(chain.withdrawalAmount)} ETH available
                  </strong>
                  <p>
                    The escrow contract credited this internal withdrawal
                    balance. The seller’s wallet is paid only after withdrawal.
                  </p>
                  {detail.actions.includes("withdraw") && executeAction && (
                    <button
                      className="dash-primary"
                      type="button"
                      disabled={actionBusy}
                      onClick={() => executeAction("withdraw")}
                    >
                      Withdraw {formatEther(chain.withdrawalAmount)} ETH
                    </button>
                  )}
                </article>
              )}
            </div>
          ) : (
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
                <dd>{verificationProviderName}</dd>
              </div>
              <div>
                <dt>Seller settlement</dt>
                <dd>
                  <StatusBadge
                    tone={
                      sellerSettled
                        ? "green"
                        : verifiedOnChain
                          ? "amber"
                          : "blue"
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
                <dt>Source chain</dt>
                <dd>{sourceChainLabel(condition.condition.sourceChainKey)}</dd>
              </div>
              <div>
                <dt>Sender</dt>
                <dd>
                  Seller ·{" "}
                  <span className="dash-mono">
                    {condition.condition.expectedSender}
                  </span>
                </dd>
              </div>
              <div>
                <dt>Recipient</dt>
                <dd>
                  Buyer ·{" "}
                  <span className="dash-mono">
                    {condition.condition.expectedRecipient}
                  </span>
                </dd>
              </div>
              <div>
                <dt>Asset</dt>
                <dd>{assetLabel(condition.condition, activeTokenMetadata)}</dd>
              </div>
              {condition.condition.tokenContract && (
                <div>
                  <dt>Token contract</dt>
                  <dd className="copy-field">
                    <span className="dash-mono">
                      {shortAddress(condition.condition.tokenContract)}
                    </span>
                    <button
                      type="button"
                      onClick={() =>
                        void copyValue(condition.condition.tokenContract!)
                      }
                    >
                      {copiedValue === condition.condition.tokenContract
                        ? "Copied"
                        : "Copy"}
                    </button>
                  </dd>
                </div>
              )}
              <div>
                <dt>Required amount</dt>
                <dd>
                  {conditionAmountLabel(
                    condition.condition,
                    activeTokenMetadata,
                  )}{" "}
                  ({amountRuleLabel(condition.condition.amountRule)})
                </dd>
              </div>
              <div>
                <dt>Raw amount</dt>
                <dd>{condition.condition.amount} units</dd>
              </div>
              {verification?.transactionHash && (
                <div>
                  <dt>Transaction hash</dt>
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
          )}
          {lifecycle !== "blockchain_condition_only" &&
            verification?.verifiedFacts && (
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
          {lifecycle !== "blockchain_condition_only" && (
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
          )}
          {lifecycle !== "blockchain_condition_only" && verifiedOnChain && (
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
                    : isRetryableVerificationFailure(verification?.failureCode)
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
  return verified
    ? `Verified by ${verificationProviderName}`
    : verificationProviderName;
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
    verification.failureCode === "SOURCE_BLOCK_NOT_ATTESTED"
  ) {
    return {
      label: "Locked — waiting for Creditcoin attestation",
      tone: "amber",
    };
  }
  if (
    verification?.status === "verification_failed" &&
    verification.failureCode === "PROOF_BUILDER_UNAVAILABLE"
  ) {
    return { label: "Locked — Proof Builder unavailable", tone: "amber" };
  }
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
  const waitingForAttestation =
    verification?.status === "verification_failed" &&
    (verification.failureCode === "SOURCE_BLOCK_NOT_ATTESTED" ||
      verification.failureCode === "PROOF_BUILDER_UNAVAILABLE");
  const withdrawalAvailable =
    detail.chain !== undefined &&
    canWithdrawEscrowFunds(
      "seller",
      detail.chain.state,
      detail.chain.withdrawalAmount,
    );
  return [
    {
      label: "Transaction hash submitted",
      status: verification ? "Complete" : "Current",
      tone: verification ? "complete" : "current",
    },
    {
      label: "Proof requested",
      status:
        verification?.status === "verification_in_progress" ||
        verification?.status === "verified"
          ? "Complete"
          : waitingForAttestation
            ? "Waiting"
            : verification?.status === "verification_failed"
              ? "Failed"
              : "Current",
      tone:
        verification?.status === "verification_failed"
          ? waitingForAttestation
            ? "pending"
            : "failed"
          : verification
            ? "complete"
            : "current",
    },
    {
      label: "Verified on-chain",
      status: isVerifiedOnChain(detail, verification)
        ? "Complete"
        : waitingForAttestation
          ? "Waiting"
          : verification?.status === "verification_failed"
            ? "Failed"
            : "Pending",
      tone: isVerifiedOnChain(detail, verification)
        ? "complete"
        : verification?.status === "verification_failed"
          ? waitingForAttestation
            ? "pending"
            : "failed"
          : "pending",
    },
    {
      label: "Payment unlocked",
      status: paymentUnlocked ? "Complete" : "Pending",
      tone: paymentUnlocked ? "complete" : "pending",
    },
    {
      label: "Seller withdrawal available",
      status: withdrawalAvailable ? "Available" : "Not available",
      tone: withdrawalAvailable ? "complete" : "pending",
    },
  ];
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

function tokenMetadataFallback(address: string): TokenMetadata | undefined {
  return tokenMetadataFallbacks[address.toLowerCase()];
}

async function resolveTokenMetadata(
  address: string,
  provider: BrowserProvider,
): Promise<TokenMetadata | undefined> {
  const fallback = tokenMetadataFallback(address);
  try {
    const token = new Contract(
      address,
      [
        "function symbol() view returns (string)",
        "function decimals() view returns (uint8)",
      ],
      provider,
    );
    const [symbolResult, decimalsResult] = await Promise.all([
      token.symbol?.(),
      token.decimals?.(),
    ]);
    const symbol = String(symbolResult).trim();
    const decimals = Number(decimalsResult);
    const normalizedSymbol = String(symbol).trim();
    const normalizedDecimals = Number(decimals);
    if (!normalizedSymbol || !Number.isInteger(normalizedDecimals))
      return fallback;
    return { symbol: normalizedSymbol, decimals: normalizedDecimals };
  } catch {
    return fallback;
  }
}

function shortAddress(address: string) {
  return `${address.slice(0, 10)}...${address.slice(-8)}`;
}

export function hasExternalBlockchainCondition(detail: AgreementDetails) {
  return (
    externalBlockchainConditionFromPolicy(detail.metadata.policy) !== undefined
  );
}

function sourceChainLabel(sourceChainKey: number) {
  return sourceChainKey === 1 ? "Sepolia" : `Chain key ${sourceChainKey}`;
}

function assetLabel(
  condition: AgreementConditionDetails["condition"],
  metadata?: TokenMetadata,
) {
  return condition.assetType === "erc20"
    ? (metadata?.symbol ?? "ERC-20 token")
    : "Native ETH on Sepolia";
}

function conditionAmountLabel(
  condition: AgreementConditionDetails["condition"],
  metadata?: TokenMetadata,
) {
  if (condition.assetType !== "native") {
    if (!metadata) return `${condition.amount} units`;
    try {
      return `${formatUnits(condition.amount, metadata.decimals)} ${metadata.symbol}`;
    } catch {
      return `${condition.amount} units`;
    }
  }
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
  verifiedOnChain = false,
) {
  if (verifying) return "Verification in progress";
  if (verification?.status === "verified")
    return verifiedOnChain
      ? "Verified on-chain"
      : "Authorized claim pending contract acceptance";
  if (
    verification?.status === "verification_failed" &&
    verification.failureCode === "SOURCE_BLOCK_NOT_ATTESTED"
  ) {
    return "Waiting for Creditcoin attestation";
  }
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

export function isRetryableVerificationFailure(code: string | undefined) {
  return (
    code === "SOURCE_BLOCK_NOT_ATTESTED" ||
    code === "PROOF_BUILDER_UNAVAILABLE" ||
    code === "PROOF_NOT_FOUND" ||
    code === "PROOF_UNAVAILABLE" ||
    code === "INVALID_PROOF" ||
    code === "PROOF_VERIFICATION_FAILURE" ||
    code === "CREDITCOIN_VERIFICATION_FAILED" ||
    code === "AUTHORIZED_CLAIM_FAILED" ||
    code === "ESCROW_SETTLEMENT_FAILED" ||
    code === "PROVIDER_FAILURE"
  );
}

export function failureLabel(code: string | undefined) {
  if (code === "PROOF_UNAVAILABLE")
    return "The blockchain transaction is confirmed, but the cross-chain proof is not available yet. Wait for attestation and try again.";
  if (code === "SOURCE_BLOCK_NOT_ATTESTED")
    return "The source block is not attested on Creditcoin yet. Verification will retry safely after attestation.";
  if (code === "PROOF_BUILDER_UNAVAILABLE")
    return "The Proof Builder service is not ready for this attested block yet.";
  if (code === "PROOF_NOT_FOUND")
    return "The Proof Builder has no proof for this transaction yet.";
  if (code === "CREDITCOIN_VERIFICATION_FAILED")
    return "Creditcoin rejected the native transaction inclusion proof.";
  if (code === "AUTHORIZED_CLAIM_FAILED")
    return "The authorized EvidenceClaimRegistry submission did not complete.";
  if (code === "ESCROW_SETTLEMENT_FAILED")
    return "The escrow did not confirm the required settlement state.";
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
