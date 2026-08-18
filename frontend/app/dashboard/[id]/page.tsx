"use client";
import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { BrowserProvider, Contract, ZeroHash, getAddress } from "ethers";
import type { AgreementAction, AgreementDetails, TransactionReceiptInfo } from "@veyronis/shared";
import { AgreementDetailView } from "../agreement-detail-view";
import { executeWalletTransaction } from "../../transaction-executor";
import { explorerTransactionUrl } from "../../network-config";

const API = process.env.NEXT_PUBLIC_BACKEND_URL ?? "http://127.0.0.1:3001";
const actionAbi = [
  "function deposit() payable", "function cancel()", "function confirmDelivery()",
  "function requestRefund(bytes32)", "function approveRefund()", "function openDispute(bytes32)",
  "function resolveDispute(uint8)", "function withdraw()",
];

export default function AgreementDetailsPage() {
  const { id } = useParams<{ id: string }>();
  const [detail, setDetail] = useState<AgreementDetails>();
  const [error, setError] = useState("");
  const [transaction, setTransaction] = useState<TransactionReceiptInfo>({ status: "IDLE" });
  const load = useCallback(async () => {
    const response = await fetch(`${API}/agreements/${id}`, { credentials: "include", cache: "no-store" });
    if (!response.ok) throw new Error("Unable to reconcile this agreement. Sign in with a participant wallet.");
    setDetail(await response.json());
  }, [id]);
  useEffect(() => { void load().catch((reason) => setError(reason.message)); }, [load]);

  async function execute(action: AgreementAction) {
    setError("");
    if (!window.ethereum || !detail?.chain) {
      setError("Connect the authenticated participant wallet first.");
      return;
    }
    const provider = new BrowserProvider(window.ethereum as never);
    const signer = await provider.getSigner();
    const signerAddress = getAddress(await signer.getAddress());
    const expected = getAddress(detail.role === "buyer" ? detail.chain.buyer : detail.role === "seller" ? detail.chain.seller : detail.chain.arbitrator);
    if (signerAddress !== expected) {
      setError(`The connected wallet is not the authenticated ${detail.role}.`);
      return;
    }
    const evidence = action === "requestRefund" || action === "openDispute"
      ? prompt("Evidence commitment (non-zero bytes32)", ZeroHash)
      : undefined;
    if (evidence === null) return;
    const network = await provider.getNetwork();
    const contract = new Contract(detail.chain.escrowAddress, actionAbi, signer);
    await executeWalletTransaction(
      async () => {
        if (action === "deposit") return contract.getFunction("deposit")({ value: detail.chain!.requiredAmount });
        if (action === "resolveRelease") return contract.getFunction("resolveDispute")(0);
        if (action === "resolveRefund") return contract.getFunction("resolveDispute")(1);
        if (action === "requestRefund" || action === "openDispute") return contract.getFunction(action)(evidence);
        return contract.getFunction(action)();
      },
      load,
      setTransaction,
      (hash) => explorerTransactionUrl(network.chainId, hash),
    );
  }

  if (error && !detail) return <main className="dashboard-shell"><p className="dash-error">{error}</p></main>;
  if (!detail) return <main className="dashboard-shell"><p className="dash-muted">Reading and reconciling contract state...</p></main>;
  return <main className="dashboard-shell">
    <a className="dash-back" href="/dashboard">&lt;- Dashboard</a>
    <header className="detail-header"><div><span className="dash-eyebrow">AGREEMENT DETAIL / {detail.role.toUpperCase()}</span><h1>{detail.chain?.state ?? "Not deployed"}</h1><p className="dash-mono">{detail.chain?.escrowAddress ?? "No escrow address"}</p></div><div className="dash-status">Block {detail.chain?.blockNumber ?? "-"}</div></header>
    {error && <p className="dash-error">{error}</p>}
    <AgreementDetailView detail={detail} transaction={transaction} execute={(action) => void execute(action)} />
  </main>;
}
