import React from "react";
import type { EscrowState } from "@veyronis/shared";

const labels: Record<EscrowState, string> = {
  AwaitingPayment: "Awaiting payment",
  AwaitingDelivery: "Awaiting delivery",
  RefundRequested: "Refund requested",
  Disputed: "Disputed",
  Complete: "Completed",
  Refunded: "Refunded",
  Cancelled: "Cancelled",
};

export function AgreementLifecycle({ state, refundRequested = false, disputed = false }: { state: EscrowState; refundRequested?: boolean; disputed?: boolean }) {
  const path: EscrowState[] = state === "Cancelled"
    ? ["AwaitingPayment", "Cancelled"]
    : state === "RefundRequested"
      ? ["AwaitingPayment", "AwaitingDelivery", "RefundRequested"]
      : state === "Refunded"
        ? ["AwaitingPayment", "AwaitingDelivery", ...(refundRequested ? ["RefundRequested" as const] : []), ...(disputed ? ["Disputed" as const] : []), "Refunded"]
        : state === "Disputed"
          ? ["AwaitingPayment", "AwaitingDelivery", ...(refundRequested ? ["RefundRequested" as const] : []), "Disputed"]
          : state === "Complete" && disputed
            ? ["AwaitingPayment", "AwaitingDelivery", "Disputed", "Complete"]
          : ["AwaitingPayment", "AwaitingDelivery", state];
  return <ol className="lifecycle" aria-label="Agreement lifecycle">
    {path.filter((value, index) => index === 0 || value !== path[index - 1]).map((value, index) => (
      <li className={`${value === state ? "current" : "complete"} ${["Complete", "Refunded", "Cancelled"].includes(value) ? "terminal" : ""}`} key={value}>
        <span>{index + 1}</span><strong>{labels[value]}</strong>
      </li>
    ))}
  </ol>;
}
