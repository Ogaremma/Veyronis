"use client";

import { useCallback, useEffect, useState } from "react";

import {
  getNimiqAccounts,
  getNimiqPayReadiness,
  sendNimPayment,
} from "../wallet/nimiq-pay";
import {
  NIM_SERVICE_FEE_LUNA,
  canAuthorizeNimServiceFee,
  canPayNimServiceFee,
  isNimiqAddress,
  nimServiceFeeBlocksContinue,
  nimServiceFeeMessage,
  nimServiceFeePayload,
  nimServiceFeePayloadBytes,
  normalizeNimiqAddress,
  type NimServiceFeeStage,
} from "./nim-service-fee";

/**
 * Optional recipient, provided through the existing public environment
 * variable mechanism. No address is hard-coded, and the field stays editable so
 * the recipient can always be checked before sending.
 */
const ENV_RECIPIENT = process.env.NEXT_PUBLIC_NIMIQ_SERVICE_FEE_RECIPIENT ?? "";

export interface NimServiceFeeState {
  readonly host: boolean;
  readonly stage: NimServiceFeeStage;
  readonly recipient: string;
  readonly recipientValid: boolean;
  readonly account: string;
  readonly reference: string;
  readonly error: string;
  readonly payload: string;
  readonly payloadBytes: number;
  readonly pending: boolean;
  readonly paid: boolean;
  readonly blocksContinue: boolean;
  readonly canAuthorize: boolean;
  readonly canPay: boolean;
  readonly setRecipient: (value: string) => void;
  readonly authorize: () => void;
  readonly pay: () => void;
}

/**
 * Nimiq Pay service-fee state for the escrow wizard.
 *
 * The state lives above the per-step rendering so a paid fee survives moving
 * between wizard steps and the same fee is never requested twice. Nothing runs
 * during render: the only mount-time work is host detection, which just reads
 * `window.nimiqPay`, and both host calls stay behind explicit user actions.
 */
export function useNimServiceFee(agreementNonce: string): NimServiceFeeState {
  const [host, setHost] = useState(false);
  const [stage, setStage] = useState<NimServiceFeeStage>("idle");
  const [recipient, setRecipient] = useState(ENV_RECIPIENT);
  const [account, setAccount] = useState("");
  const [reference, setReference] = useState("");
  const [error, setError] = useState("");
  const payload = nimServiceFeePayload(agreementNonce);

  // Detection only. This reads window.nimiqPay, never imports the Mini App SDK
  // and never asks the host for anything.
  useEffect(() => {
    setHost(getNimiqPayReadiness().host);
  }, []);

  // A payment belongs to one agreement payload. Editing the agreement nonce
  // changes that payload, so an earlier payment no longer applies to it.
  useEffect(() => {
    setStage("idle");
    setReference("");
    setError("");
  }, [payload]);

  const pending = stage === "pending";
  const paid = stage === "success" && reference !== "";
  const recipientValid = isNimiqAddress(recipient);
  const canAuthorize = canAuthorizeNimServiceFee({ host, paid, pending });
  const canPay = canPayNimServiceFee({
    host,
    paid,
    pending,
    authorized: account !== "",
    recipientValid,
  });

  const authorize = useCallback(async () => {
    if (!canAuthorize) return;
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
  }, [canAuthorize]);

  const pay = useCallback(async () => {
    if (!canPay) return;
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
  }, [canPay, payload, recipient]);

  return {
    host,
    stage,
    recipient,
    recipientValid,
    account,
    reference,
    error,
    payload,
    payloadBytes: nimServiceFeePayloadBytes(agreementNonce),
    pending,
    paid,
    blocksContinue: nimServiceFeeBlocksContinue({ host, paid }),
    canAuthorize,
    canPay,
    setRecipient,
    authorize: () => void authorize(),
    pay: () => void pay(),
  };
}
