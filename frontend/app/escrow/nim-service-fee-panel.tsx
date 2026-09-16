"use client";

import React from "react";

import { GlassButton, GlassCard, GlassInput, StatusBadge } from "../ui/glass";
import {
  NIM_SERVICE_FEE_DISCLOSURE,
  NIM_SERVICE_FEE_LABEL,
  NIM_SERVICE_FEE_LUNA,
  describeNimReference,
} from "./nim-service-fee";
import type { NimServiceFeeState } from "./use-nim-service-fee";

/**
 * Nimiq Pay service fee panel for the escrow wizard review step.
 *
 * The component is presentational: all state lives in `useNimServiceFee` so a
 * paid fee survives navigating between wizard steps. It renders nothing outside
 * Nimiq Pay, which is what keeps the ordinary browser MetaMask and WalletConnect
 * flow free of any NIM requirement.
 *
 * Every host interaction is an explicit tap on one of the two buttons below.
 * Nothing is requested during render, and neither button chains into the other.
 */
export function NimServiceFeePanel({ fee }: { fee: NimServiceFeeState }) {
  if (!fee.host) return null;

  return (
    <GlassCard className="nim-service-fee">
      <div className="nim-service-fee-head">
        <div>
          <strong>Nimiq Pay service fee</strong>
          <small>
            {NIM_SERVICE_FEE_LABEL} in native NIM from your Nimiq Pay wallet is
            required before this agreement can be created.
          </small>
        </div>
        <StatusBadge tone={serviceFeeStageTone(fee)}>
          {serviceFeeStageLabel(fee)}
        </StatusBadge>
      </div>
      <p className="nim-service-fee-note">{NIM_SERVICE_FEE_DISCLOSURE}</p>
      <label className="nim-service-fee-field">
        Recipient Nimiq address
        <GlassInput
          value={fee.recipient}
          onChange={(event) => fee.setRecipient(event.target.value)}
          placeholder="NQ07 ..."
          spellCheck={false}
          autoComplete="off"
          disabled={fee.pending || fee.paid}
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
            <code>{fee.payload}</code> ({fee.payloadBytes} bytes)
          </dd>
        </div>
        <div>
          <dt>Authorized Nimiq wallet</dt>
          <dd>
            {fee.account === "" ? (
              "Not requested yet"
            ) : (
              <code>{fee.account}</code>
            )}
          </dd>
        </div>
      </dl>
      <div className="nim-service-fee-actions">
        <GlassButton onClick={fee.authorize} disabled={!fee.canAuthorize}>
          {fee.account === ""
            ? "Authorize Nimiq Pay wallet"
            : "Re-check Nimiq Pay wallet"}
        </GlassButton>
        <GlassButton
          className="primary-button"
          onClick={fee.pay}
          disabled={!fee.canPay}
        >
          {fee.pending
            ? "Waiting for Nimiq Pay"
            : `Pay ${NIM_SERVICE_FEE_LABEL} service fee`}
        </GlassButton>
      </div>
      {!fee.paid && !fee.recipientValid && (
        <p className="nim-service-fee-warn">
          Enter a complete NQ... Nimiq address to enable the payment.
        </p>
      )}
      {fee.paid ? (
        <div className="nim-service-fee-result">
          <strong>Service fee submitted</strong>
          <span>
            Nimiq Pay accepted the request. You can continue with this
            agreement.
          </span>
          <span>{describeNimReference(fee.reference)}</span>
          <code>{fee.reference}</code>
        </div>
      ) : null}
      {fee.error !== "" && (
        <p className="form-error" role="alert">
          {fee.error}
        </p>
      )}
    </GlassCard>
  );
}

function serviceFeeStageLabel(fee: NimServiceFeeState): string {
  if (fee.paid) return "Service fee submitted";
  if (fee.pending) return "Waiting for Nimiq Pay";
  if (fee.stage === "failure") return "Not completed";
  if (fee.account === "") return "Authorization required";
  return "Ready to pay";
}

function serviceFeeStageTone(
  fee: NimServiceFeeState,
): "blue" | "green" | "amber" | "red" {
  if (fee.paid) return "green";
  if (fee.pending) return "amber";
  if (fee.stage === "failure") return "red";
  return "blue";
}
