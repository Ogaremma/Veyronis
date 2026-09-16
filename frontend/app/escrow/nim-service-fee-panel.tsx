"use client";

import React, { useCallback, useEffect, useState } from "react";

import {
  NimiqPayError,
  getNimiqAccounts,
  getNimiqPayReadiness,
  sendNimPayment,
} from "../wallet/nimiq-pay";
import { GlassButton, GlassCard, GlassInput, StatusBadge } from "../ui/glass";
import {
  NIM_SERVICE_FEE_DISCLOSURE,
  NIM_SERVICE_FEE_LABEL,
  NIM_SERVICE_FEE_LUNA,
  describeNimReference,
  isNimiqAddress,
  nimServiceFeePayload,
  nimServiceFeePayloadBytes,
  normalizeNimiqAddress,
  type NimServiceFeeStage,
} from "./nim-service-fee";

/**
 * Optional recipient, set through the existing public environment variable
 * mechanism. No address is hard-coded; the field stays editable so the
 * recipient can always be checked before sending.
 */
const ENV_RECIPIENT = process.env.NEXT_PUBLIC_NIMIQ_SERVICE_FEE_RECIPIENT ?? "";

/**
 * Optional Nimiq Pay service fee shown inside the escrow-creation flow.
 *
 * It renders only when the app is running inside Nimiq Pay, so the ordinary
 * browser MetaMask and WalletConnect flows never see it and never require a NIM
 * payment. Every host operation happens behind its own button: nothing is
 * requested on page load and no account or payment call is chained.
 */
export function NimServiceFeePanel({
  agreementNonce,
}: {
  agreementNonce: string;
}) {
  const [host, setHost] = useState(false);
  const [stage, setStage] = useState<NimServiceFeeStage>("idle");
  const [account, setAccount] = useState("");
  const [reference, setReference] = useState("");
  const [error, setError] = useState("");
  const [recipient, setRecipient] = useState(ENV_RECIPIENT);

  // Detection only. This reads window.nimiqPay, never imports the Mini App SDK
  // and never asks the host for anything.
  useEffect(() => {
    setHost(getNimiqPayReadiness().host);
  }, []);

  const payload = nimServiceFeePayload(agreementNonce);
  const recipientValid = isNimiqAddress(recipient);
  const pending = stage === "pending";

  const authorize = useCallback(async () => {
    setStage("pending");
    setError("");
    try {
      const accounts = await getNimiqAccounts();
      const first = accounts[0];
      if (first === undefined) {
        setStage("failure");
        setError("Nimiq Pay did not return an authorized account.");
        return;
      }
      setAccount(first);
      setStage("idle");
    } catch (reason) {
      console.warn("[veyronis:nimiq] account request failed", reason);
      setStage("failure");
      setError(nimServiceFeeMessage(reason));
    }
  }, []);

  const pay = useCallback(async () => {
    setStage("pending");
    setError("");
    setReference("");
    try {
      const result = await sendNimPayment({
        recipient: normalizeNimiqAddress(recipient),
        valueLuna: NIM_SERVICE_FEE_LUNA,
        data: payload,
      });
      console.info("[veyronis:nimiq] service fee reference", result.reference);
      setAccount(result.sender);
      setReference(result.reference);
      setStage("success");
    } catch (reason) {
      console.warn("[veyronis:nimiq] service fee failed", reason);
      setStage("failure");
      setError(nimServiceFeeMessage(reason));
    }
  }, [payload, recipient]);

  if (!host) return null;

  return (
    <GlassCard className="nim-service-fee">
      <div className="nim-service-fee-head">
        <div>
          <strong>Nimiq Pay service fee</strong>
          <small>
            Optional {NIM_SERVICE_FEE_LABEL} registration fee for this
            agreement, paid in native NIM from your Nimiq Pay wallet.
          </small>
        </div>
        <StatusBadge tone={serviceFeeStageTone(stage)}>
          {serviceFeeStageLabel(stage)}
        </StatusBadge>
      </div>
      <p className="nim-service-fee-note">{NIM_SERVICE_FEE_DISCLOSURE}</p>
      <label className="nim-service-fee-field">
        Recipient Nimiq address
        <GlassInput
          value={recipient}
          onChange={(event) => setRecipient(event.target.value)}
          placeholder="NQ07 ..."
          spellCheck={false}
          autoComplete="off"
          disabled={pending}
        />
      </label>
      <p className="nim-service-fee-warn">
        Check the recipient address before sending. NIM transfers cannot be
        reversed.
      </p>
      <dl className="nim-service-fee-facts">
        <div>
          <dt>Amount</dt>
          <dd>
            {NIM_SERVICE_FEE_LABEL} ({NIM_SERVICE_FEE_LUNA} Luna)
          </dd>
        </div>
        <div>
          <dt>Reference data</dt>
          <dd>
            <code>{payload}</code> ({nimServiceFeePayloadBytes(agreementNonce)}{" "}
            bytes)
          </dd>
        </div>
        <div>
          <dt>Authorized Nimiq wallet</dt>
          <dd>
            {account === "" ? "Not requested yet" : <code>{account}</code>}
          </dd>
        </div>
      </dl>
      <div className="nim-service-fee-actions">
        <GlassButton onClick={() => void authorize()} disabled={pending}>
          {account === ""
            ? "Authorize Nimiq Pay wallet"
            : "Re-check Nimiq Pay wallet"}
        </GlassButton>
        <GlassButton
          className="primary-button"
          onClick={() => void pay()}
          disabled={pending || !recipientValid}
        >
          {pending
            ? "Waiting for Nimiq Pay"
            : `Pay ${NIM_SERVICE_FEE_LABEL} service fee`}
        </GlassButton>
      </div>
      {!recipientValid && (
        <p className="nim-service-fee-warn">
          Enter a complete NQ... Nimiq address to enable the payment.
        </p>
      )}
      {stage === "success" && (
        <div className="nim-service-fee-result">
          <strong>Nimiq Pay accepted the request</strong>
          <span>{describeNimReference(reference)}</span>
          <code>{reference}</code>
        </div>
      )}
      {error !== "" && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
    </GlassCard>
  );
}

/** Normalizes a host failure into a message that is safe to show a user. */
export function nimServiceFeeMessage(reason: unknown): string {
  if (reason instanceof NimiqPayError && reason.code === "USER_REJECTED") {
    return "You rejected the request in Nimiq Pay. No NIM was sent.";
  }
  if (reason instanceof NimiqPayError && reason.code === "INVALID_INPUT") {
    return `The payment details were rejected before sending: ${reason.message}`;
  }
  if (reason instanceof Error && reason.message.length > 0) {
    return reason.message;
  }
  return "The Nimiq Pay request failed.";
}

function serviceFeeStageLabel(stage: NimServiceFeeStage): string {
  switch (stage) {
    case "pending":
      return "Waiting for Nimiq Pay";
    case "success":
      return "Request accepted";
    case "failure":
      return "Not completed";
    default:
      return "Optional";
  }
}

function serviceFeeStageTone(
  stage: NimServiceFeeStage,
): "blue" | "green" | "amber" | "red" {
  switch (stage) {
    case "pending":
      return "amber";
    case "success":
      return "green";
    case "failure":
      return "red";
    default:
      return "blue";
  }
}
