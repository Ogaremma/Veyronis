import React from "react";
import type { AgreementAction, AgreementDetails, TransactionReceiptInfo } from "@veyronis/shared";
import { formatEther, ZeroHash } from "ethers";
import { AgreementLifecycle } from "./agreement-lifecycle";

const labels: Record<AgreementAction, string> = {
  deposit: "Deposit", cancel: "Cancel before payment", confirmDelivery: "Confirm delivery",
  requestRefund: "Request refund", approveRefund: "Approve refund", openDispute: "Open dispute",
  resolveRelease: "Resolve for seller", resolveRefund: "Resolve for buyer", withdraw: "Withdraw",
};

export function AgreementDetailView({ detail, transaction, execute }: {
  detail: AgreementDetails;
  transaction: TransactionReceiptInfo;
  execute: (action: AgreementAction) => void;
}) {
  const chain = detail.chain;
  if (!chain) return <p className="dash-muted">This agreement has not been deployed.</p>;
  const busy = !["IDLE", "COMPLETE", "USER_REJECTED", "TRANSACTION_REVERTED", "RPC_ERROR", "RECONCILIATION_FAILED"].includes(transaction.status);
  const primary = detail.actions[0];
  return <>
    {detail.reconciliation?.status === "METADATA_STALE" && <aside className="reconciliation-note">
      Blockchain state is authoritative. Metadata is being synchronized.
    </aside>}
    <section className="detail-section">
      <div className="section-heading"><span className="dash-eyebrow">AGREEMENT OVERVIEW</span><h2>Contract terms and participants</h2></div>
      <dl className="overview-grid">
        <dt>Escrow address</dt><dd className="dash-mono">{chain.escrowAddress}</dd>
        <dt>Buyer</dt><dd className="dash-mono">{chain.buyer}</dd>
        <dt>Seller</dt><dd className="dash-mono">{chain.seller}</dd>
        <dt>Arbitrator</dt><dd className="dash-mono">{chain.arbitrator}</dd>
        <dt>Required amount</dt><dd>{formatEther(chain.requiredAmount)} ETH</dd>
        <dt>Current status</dt><dd><span className="dash-status">{chain.state}</span></dd>
        <dt>Agreement commitment</dt><dd className="dash-mono">{chain.agreementCommitment}</dd>
        <dt>Evidence policy commitment</dt><dd className="dash-mono">{chain.evidencePolicyCommitment}</dd>
      </dl>
    </section>
    <section className="detail-section"><div className="section-heading"><span className="dash-eyebrow">LIFECYCLE</span><h2>Authoritative escrow state</h2></div><AgreementLifecycle state={chain.state} refundRequested={detail.timeline.some(event => event.name === "RefundRequested")} disputed={detail.timeline.some(event => event.name === "DisputeOpened")} /></section>
    <section className="detail-grid">
      <div className="dash-panel action-panel"><span className="dash-eyebrow">AVAILABLE ACTION</span><h2>{primary ? actionLabel(primary, chain.requiredAmount, chain.withdrawalAmount) : "No action available"}</h2>
        <div className="dash-actions">{detail.actions.map(action => <button className={action === primary ? "dash-primary" : "dash-action"} disabled={busy} key={action} onClick={() => execute(action)}>{actionLabel(action, chain.requiredAmount, chain.withdrawalAmount)}</button>)}</div>
        {!primary && <p className="dash-muted">Your wallet has no valid action in the current on-chain state.</p>}
      </div>
      <div className="dash-panel receipt-panel"><span className="dash-eyebrow">TRANSACTION STATUS</span><h2>{transaction.status.replaceAll("_", " ")}</h2>
        {transaction.hash && <p className="dash-mono">{transaction.hash}</p>}
        {transaction.blockNumber && <p>Confirmed in block {transaction.blockNumber}</p>}
        {transaction.explorerUrl && <a href={transaction.explorerUrl} target="_blank" rel="noreferrer">View transaction</a>}
        {transaction.error && <p className="dash-error">{transaction.error}</p>}
      </div>
    </section>
    <section className="detail-grid">
      <div className="dash-panel"><span className="dash-eyebrow">EVIDENCE</span><h2>{chain.verifiedClaimId !== ZeroHash ? "VERIFIED ON-CHAIN EVIDENCE" : "ADVISORY EVIDENCE"}</h2>
        <p className="dash-muted">Evidence informs the agreement and arbitrator. It does not automatically resolve a dispute or move funds.</p>
        <dl><dt>Active commitment</dt><dd className="dash-mono">{chain.activeEvidenceCommitment}</dd><dt>Verified claim</dt><dd className="dash-mono">{chain.verifiedClaimId}</dd></dl>
      </div>
      <div className="dash-panel"><span className="dash-eyebrow">WITHDRAWAL</span><h2>{formatEther(chain.withdrawalAmount)} ETH available</h2><p className="dash-mono">{detail.role === "buyer" ? chain.buyer : detail.role === "seller" ? chain.seller : chain.arbitrator}</p>
        <button className="dash-primary" disabled={!detail.actions.includes("withdraw") || busy} onClick={() => execute("withdraw")}>Withdraw {formatEther(chain.withdrawalAmount)} ETH</button>
      </div>
    </section>
    <section className="dash-panel dash-timeline"><span className="dash-eyebrow">TRANSACTION ACTIVITY</span><h2>Contract and evidence events</h2>
      {detail.timeline.length === 0 ? <p className="dash-muted">No contract events indexed yet.</p> : detail.timeline.map(event => <div className="timeline-event" key={`${event.transactionHash}-${event.logIndex}`}><span className="timeline-dot"/><div><strong>{event.name}</strong>{event.advisory && <span className="advisory">Verified on-chain evidence</span>}<p className="dash-muted">Block {event.blockNumber}{event.timestamp ? ` / ${new Date(event.timestamp).toLocaleString()}` : ""}</p><p className="dash-mono">{event.actor ?? "Participant unavailable"} / {event.transactionHash}</p></div></div>)}
    </section>
  </>;
}

function actionLabel(action: AgreementAction, required: string, withdrawal: string) {
  if (action === "deposit") return `Deposit ${formatEther(required)} ETH`;
  if (action === "withdraw") return `Withdraw ${formatEther(withdrawal)} ETH`;
  return labels[action];
}
