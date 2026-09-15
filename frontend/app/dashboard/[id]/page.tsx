"use client";
import { useCallback, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { Contract, ZeroHash, getAddress } from "ethers";
import { useAccount } from "wagmi";
import type {
  AgreementAction,
  AgreementDetails,
  TransactionReceiptInfo,
} from "@veyronis/shared";
import type {
  AgreementConditionVerification,
  WorkEvidenceSubmission,
} from "@veyronis/shared";
import { AgreementDetailView } from "../agreement-detail-view";
import { WorkEvidencePanel } from "../work-evidence-panel";
import { AgreementConditionPanel } from "../agreement-condition-panel";
import {
  AgreementNavigation,
  navigateAgreementBack,
  navigateAgreementHome,
} from "../agreement-navigation";
import { executeWalletTransaction } from "../../transaction-executor";
import { fundEscrow } from "../../escrow/escrow-funding";
import { explorerTransactionUrl } from "../../network-config";
import {
  activeWalletChainId,
  requiredTransactionChainId,
  transactionNetworkError,
} from "../../transaction-network-guard";

const API = process.env.NEXT_PUBLIC_BACKEND_URL as string;
const actionAbi = [
  "function cancel()",
  "function confirmDelivery()",
  "function requestRefund(bytes32)",
  "function approveRefund()",
  "function openDispute(bytes32)",
  "function resolveDispute(uint8)",
  "function withdraw()",
];

declare global {
  interface Window {
    ethereum?: unknown;
  }
}

export default function AgreementDetailsPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { address, chainId, connector, isConnected, isReconnecting } = useAccount();
  const walletReady = isConnected && Boolean(address && connector) && !isReconnecting;
  const [detail, setDetail] = useState<AgreementDetails>();
  const [workEvidenceSubmissions, setWorkEvidenceSubmissions] = useState<
    WorkEvidenceSubmission[]
  >([]);
  const [conditionVerification, setConditionVerification] =
    useState<AgreementConditionVerification>();
  const [error, setError] = useState("");
  const [transaction, setTransaction] = useState<TransactionReceiptInfo>({
    status: "IDLE",
  });
  const load = useCallback(async () => {
    let response: Response;
    try {
      response = await fetch(`${API}/agreements/${id}`, {
        credentials: "include",
        cache: "no-store",
      });
    } catch {
      throw new Error(
        "Unable to reach the agreement service. Check your connection and try again.",
      );
    }
    if (response.status === 401)
      throw new Error(
        "Wallet authentication required. Sign in with a participant wallet and try again.",
      );
    if (response.status === 403)
      throw new Error("This wallet is not a participant in this agreement.");
    if (!response.ok)
      throw new Error(
        `Unable to load agreement details (HTTP ${response.status}).`,
      );
    const nextDetail = (await response.json()) as AgreementDetails;
    setDetail(nextDetail);
    return nextDetail;
  }, [id]);
  useEffect(() => {
    void load().catch((reason) => setError(reason.message));
  }, [load]);

  useEffect(() => {
    setWorkEvidenceSubmissions([]);
    setConditionVerification(undefined);
  }, [id]);

  async function execute(action: AgreementAction) {
    setError("");
    if (!detail?.chain) {
      setError("A deployed escrow is required before using this action.");
      return;
    }
    const { provider, walletProvider, chainId: liveChainId } = await activeWalletChainId(connector);
    const networkError = transactionNetworkError(liveChainId, requiredTransactionChainId());
    if (networkError) {
      setError(networkError);
      return;
    }
    if (action === "deposit") {
      await fundEscrow({
        getProvider: async () => walletProvider,
        walletAddress: address,
        walletChainId: chainId,
        details: detail,
        reconcile: load,
        onTransaction: setTransaction,
      });
      return;
    }
    const signer = await provider.getSigner();
    const signerAddress = getAddress(await signer.getAddress());
    const expected = getAddress(
      detail.role === "buyer"
        ? detail.chain.buyer
        : detail.role === "seller"
          ? detail.chain.seller
          : detail.chain.arbitrator,
    );
    if (signerAddress !== expected) {
      setError(`The connected wallet is not the authenticated ${detail.role}.`);
      return;
    }
    const evidence =
      action === "requestRefund" || action === "openDispute"
        ? prompt("Evidence commitment (non-zero bytes32)", ZeroHash)
        : undefined;
    if (evidence === null) return;
    const network = await provider.getNetwork();
    const contract = new Contract(
      detail.chain.escrowAddress,
      actionAbi,
      signer,
    );
    await executeWalletTransaction(
      async () => {
        if (action === "resolveRelease")
          return contract.getFunction("resolveDispute")(0);
        if (action === "resolveRefund")
          return contract.getFunction("resolveDispute")(1);
        if (action === "requestRefund" || action === "openDispute")
          return contract.getFunction(action)(evidence);
        return contract.getFunction(action)();
      },
      async () => {
        await load();
        return { status: "CONFIRMED" as const };
      },
      setTransaction,
      (hash) => explorerTransactionUrl(network.chainId, hash),
    );
  }

  function handleActionFailure(reason: unknown) {
    const original = reason instanceof Error ? reason.message : String(reason);
    const code = (reason as { code?: string | number })?.code;
    const lower = original.toLowerCase();
    const category =
      code === 4001 || code === "ACTION_REJECTED" || lower.includes("user rejected")
        ? "MetaMask request rejected"
        : lower.includes("insufficient funds")
          ? "Insufficient ETH"
          : lower.includes("wrong network") || lower.includes("chain")
            ? "Wrong network"
            : lower.includes("signer") || lower.includes("account") || lower.includes("buyer")
              ? "Signer/account mismatch"
              : lower.includes("provider") || lower.includes("wallet")
                ? "Wallet/provider unavailable"
                : "Contract/RPC failure";
    setTransaction({ status: "RPC_ERROR", error: original });
    setError(`${category}: ${original}`);
  }

  if (error && !detail)
    return (
      <main className="dashboard-shell">
        <AgreementNavigation
          onBack={() => navigateAgreementBack(router)}
          onHome={() => navigateAgreementHome(router)}
        />
        <p className="dash-error">{error}</p>
      </main>
    );
  if (!detail)
    return (
      <main className="dashboard-shell">
        <AgreementNavigation
          onBack={() => navigateAgreementBack(router)}
          onHome={() => navigateAgreementHome(router)}
        />
        <p className="dash-muted">Reading and reconciling contract state...</p>
      </main>
    );
  return (
    <main className="dashboard-shell">
      <AgreementNavigation
        onBack={() => navigateAgreementBack(router)}
        onHome={() => navigateAgreementHome(router)}
      />
      <header className="detail-header">
        <div>
          <span className="dash-eyebrow">
            AGREEMENT DETAIL / {detail.role.toUpperCase()}
          </span>
          <h1>{detail.chain?.state ?? "Not deployed"}</h1>
          <p className="dash-mono">
            {detail.chain?.escrowAddress ?? "No escrow address"}
          </p>
        </div>
        <div className="dash-status">
          Block {detail.chain?.blockNumber ?? "-"}
        </div>
      </header>
      {error && <p className="dash-error">{error}</p>}
      <AgreementDetailView
        detail={detail}
        transaction={transaction}
        execute={(action) => void execute(action).catch(handleActionFailure)}
        walletReady={walletReady}
        workEvidenceSubmissions={workEvidenceSubmissions}
        conditionVerification={conditionVerification}
      />
      <AgreementConditionPanel
        detail={detail}
        baseUrl={API}
        executeAction={(action) => void execute(action).catch(handleActionFailure)}
        actionBusy={
          !walletReady ||
          ![
            "IDLE",
            "COMPLETE",
            "USER_REJECTED",
            "TRANSACTION_REVERTED",
            "RPC_ERROR",
            "RECONCILIATION_FAILED",
          ].includes(transaction.status)
        }
        onVerificationChange={setConditionVerification}
        onSettlementChange={async () => {
          await load();
        }}
      />
      {detail.chain && (
        <WorkEvidencePanel
          detail={detail}
          baseUrl={API}
          onSubmissionsChange={setWorkEvidenceSubmissions}
        />
      )}
    </main>
  );
}
