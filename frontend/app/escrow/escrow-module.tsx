"use client";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useAccount } from "wagmi";
import { ZeroAddress, formatEther, hexlify, id, parseEther, randomBytes } from "ethers";
import { computeAgreementCommitment, computeEvidencePolicyCommitment, validateAgreementDraft, type AgreementDashboardItem, type AgreementDraft } from "@veyronis/shared";
import { HttpAgreementCreationClient } from "../agreement-client";
import { requiredTransactionChainId, transactionNetworkError } from "../transaction-network-guard";
import { agreementAction, agreementCounterparty, agreementDisplayStatus, isClosedAgreement, roleLabel } from "./agreement-status";
import { deployAndFundAgreement, type DeployAndFundResult, type DeployAndFundStage } from "./deploy-and-fund-flow";
import { fundEscrow } from "./escrow-funding";
import { GlassButton, GlassCard, GlassInput, SectionHeader, StatusBadge } from "../ui/glass";

const API = process.env.NEXT_PUBLIC_BACKEND_URL as string;
const REGISTRY = (process.env.NEXT_PUBLIC_EVIDENCE_REGISTRY_ADDRESS ?? process.env.NEXT_PUBLIC_VEYRONIS_EVIDENCE_REGISTRY_ADDRESS) as string;
type AgreementItem = AgreementDashboardItem;
type WalletConnector = { getProvider(): Promise<unknown> } | undefined;

export function EscrowModule({ walletAddress, networkName }: { walletAddress: string; networkName: string }) {
  const { chainId, connector } = useAccount();
  const [creating, setCreating] = useState(false);
  const [items, setItems] = useState<AgreementItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const load = useCallback(async () => {
    setLoading(true); setError("");
    try {
      const response = await fetch(`${API}/agreements`, { credentials: "include", cache: "no-store" });
      if (!response.ok) throw new Error("Unable to load agreements");
      setItems(await response.json());
    } catch {
      setError("Unable to load live contracts. Sign in with a participant wallet and try again.");
    } finally { setLoading(false); }
  }, []);
  useEffect(() => { void load(); }, [load, walletAddress]);
  const liveItems = items.filter(item => !isClosedAgreement(item));
  const closedItems = items.filter(isClosedAgreement);
  const awaitingPayment = liveItems.filter(item => agreementDisplayStatus(item) === "AwaitingPayment").length;
  const awaitingDelivery = liveItems.filter(item => agreementDisplayStatus(item) === "AwaitingDelivery").length;
  const disputed = liveItems.filter(item => agreementDisplayStatus(item) === "Disputed").length;
  if (creating) return <EscrowWizard walletAddress={walletAddress} networkName={networkName} chainId={chainId} connector={connector as WalletConnector} close={() => { setCreating(false); void load(); }} />;
  return <div className="module-page"><SectionHeader eyebrow="PERSISTENT AGREEMENTS" title="Live Contracts" action={<GlassButton className="primary-button" onClick={() => setCreating(true)}>+ Create Escrow</GlassButton>} />
    <div className="metric-grid"><Metric label="Live contracts" value={liveItems.length} /><Metric label="Awaiting payment" value={awaitingPayment} /><Metric label="Awaiting delivery" value={awaitingDelivery} /><Metric label="Closed" value={closedItems.length} /><Metric label="Disputed" value={disputed} tone="amber" /></div>
    <GlassCard className="agreement-table"><div className="table-title"><div><h2>Live Contracts</h2><p>Agreements persist for buyers, sellers, and arbitrators. Contract state remains authoritative.</p></div><StatusBadge>{liveItems.length} live</StatusBadge></div>{loading ? <div className="empty-agreements"><span className="escrow-icon">{"\u25c7"}</span><h3>Loading live contracts...</h3></div> : error ? <p className="form-error" role="alert">{error}</p> : liveItems.length ? liveItems.map(item => <AgreementCard item={item} key={item.metadata.id} />) : <div className="empty-agreements"><span className="escrow-icon">{"\u25c7"}</span><h3>No live contracts</h3><p>Agreements remain here after disconnect and reconnect for every authenticated participant.</p><GlassButton onClick={() => setCreating(true)}>Create Escrow</GlassButton></div>}</GlassCard>
    <GlassCard className="agreement-table closed-contracts"><div className="table-title"><div><h2>Closed / Completed Contracts</h2><p>Historical agreements are retained for audit and review.</p></div><StatusBadge tone="green">{closedItems.length} closed</StatusBadge></div>{!loading && !error && closedItems.length ? closedItems.map(item => <AgreementCard item={item} key={item.metadata.id} />) : <div className="empty-agreements"><span className="escrow-icon">{"\u25c7"}</span><h3>No closed contracts</h3><p>Completed, refunded, and cancelled agreements will appear here.</p></div>}</GlassCard>
  </div>;
}
function Metric({ label, value, tone }: { label: string; value: number; tone?: "amber" }) { return <GlassCard className="metric"><span>{label}</span><strong>{value}</strong>{tone && <i />}</GlassCard>; }
function formatAmount(value: string) { try { return formatEther(value); } catch { return value; } }

function AgreementCard({ item }: { item: AgreementItem }) {
  return <a className="agreement-item" href={`/dashboard/${item.metadata.id}`}>
    <span className="escrow-icon">{"\u25c7"}</span>
    <div><strong>{item.metadata.escrowAddress ? `${item.metadata.escrowAddress.slice(0, 12)}...${item.metadata.escrowAddress.slice(-6)}` : "Agreement awaiting deployment"}</strong><small>{roleLabel(item.role)} · {agreementCounterparty(item)} · {formatAmount(item.metadata.requiredAmount)} ETH</small></div>
    <StatusBadge tone={agreementDisplayStatus(item) === "Disputed" ? "amber" : isClosedAgreement(item) ? "green" : "blue"}>{agreementDisplayStatus(item)}</StatusBadge>
    <span className="agreement-action">{agreementAction(item)}</span>
  </a>;
}

function EscrowWizard({ walletAddress, networkName, chainId, connector, close }: { walletAddress: string; networkName: string; chainId: number | undefined; connector: WalletConnector; close: () => void }) {
  const [step, setStep] = useState(1); const [error, setError] = useState(""); const [deploying, setDeploying] = useState(false); const [deployed, setDeployed] = useState(""); const [agreementId, setAgreementId] = useState(""); const [flowStage, setFlowStage] = useState<DeployAndFundStage>("deploying"); const [flowResult, setFlowResult] = useState<DeployAndFundResult>();
  const [form, setForm] = useState({ buyer: walletAddress, seller: "", arbitrator: "", evidenceRegistry: REGISTRY, requiredAmountEth: "0.1", agreementNonce: hexlify(randomBytes(32)), sourceChainKey: "1", assetKind: "native", expectedSourceContract: ZeroAddress, expectedRecipient: "", expectedAsset: ZeroAddress, expectedSender: walletAddress, amountRule: "exact", evidenceAmountEth: "0.1", minSourceBlock: "0", maxSourceBlock: "0", calldataSelector: "0x00000000", requireTransferEvent: false });
  const update = (name: string, value: string | boolean) => setForm(current => ({ ...current, [name]: value }));
  const draft = useMemo<AgreementDraft>(() => ({ buyer: form.buyer, seller: form.seller, arbitrator: form.arbitrator, evidenceRegistry: form.evidenceRegistry, requiredAmount: toWei(form.requiredAmountEth), agreementNonce: form.agreementNonce, policy: { version: 1, evidenceType: id("SOURCE_PAYMENT"), sourceChainKey: Number(form.sourceChainKey), assetKind: form.assetKind as "native" | "erc20", expectedSourceContract: form.expectedSourceContract, expectedRecipient: form.expectedRecipient || form.seller, expectedAsset: form.expectedAsset, expectedSender: form.expectedSender || form.buyer, amountRule: form.amountRule as "exact" | "minimum", amount: toWei(form.evidenceAmountEth), minSourceBlock: form.minSourceBlock, maxSourceBlock: form.maxSourceBlock, calldataSelector: form.calldataSelector, requireTransferEvent: form.requireTransferEvent } }), [form]);
  const preview = useMemo(() => { try { const valid = validateAgreementDraft(draft); const policy = computeEvidencePolicyCommitment(valid.policy); return { policy, agreement: computeAgreementCommitment(valid, policy) }; } catch { return undefined; } }, [draft]);
  function next() { setError(""); if (step === 1 && (!form.buyer || !form.seller || !form.arbitrator)) return setError("Enter all participant wallet addresses"); if (step === 2 && (!form.requiredAmountEth || Number(form.requiredAmountEth) <= 0)) return setError("Enter a valid payment amount"); if (step === 3 && !preview) return setError("Complete the evidence policy with valid addresses and values"); setStep(current => Math.min(4, current + 1)); }
  async function deployAndFund() {
    const networkError = transactionNetworkError(chainId, requiredTransactionChainId());
    if (networkError) { setError(networkError); return; }
    setDeploying(true); setError("");
    try {
      const client = new HttpAgreementCreationClient(API);
      const result = await deployAndFundAgreement({
        draft: validateAgreementDraft(draft),
        createAndDeploy: async (draftToDeploy) => {
          const prepared = await client.prepare(draftToDeploy);
          const deployedAgreement = await client.confirmAndDeploy(prepared.id);
          if (deployedAgreement.deploymentStatus !== "DEPLOYED" || !deployedAgreement.escrowAddress) throw new Error("Deployment was not confirmed");
          setAgreementId(deployedAgreement.id); setDeployed(deployedAgreement.escrowAddress); setStep(5);
          return deployedAgreement;
        },
        getAgreement: id => client.getAgreement(id),
        fundEscrow: details => fundEscrow({
          getProvider: async () => {
            if (!connector) throw new Error("Connect the agreement buyer wallet first.");
            return connector.getProvider();
          },
          walletAddress,
          walletChainId: chainId,
          details,
          reconcile: async () => { await client.getAgreement(details.metadata.id); },
        }),
        onStage: setFlowStage,
      });
      setFlowResult(result);
      if (!result.funded) setError(result.transaction.error ?? "Funding did not complete. The deployed agreement remains saved as AwaitingPayment.");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Deployment did not complete");
    } finally { setDeploying(false); }
  }
  return <div className="module-page wizard-page"><SectionHeader eyebrow="NEW ESCROW" title={step === 5 ? "Agreement deployed" : "Create Escrow"} action={<button className="text-button" onClick={close} disabled={deploying}>Close</button>} /><div className="wizard-layout"><aside className="wizard-steps">{["Participants", "Payment", "Evidence Policy", "Review", "Deploy & Fund"].map((label, index) => <div className={step === index + 1 ? "current" : step > index + 1 ? "done" : ""} key={label}><span>{step > index + 1 ? "✓" : index + 1}</span><div><strong>{label}</strong><small>{index === 0 ? "Wallet roles" : index === 1 ? "Asset and amount" : index === 2 ? "Verification rules" : index === 3 ? "Immutable terms" : "Local contract"}</small></div></div>)}</aside><GlassCard className="wizard-card">
    {step === 1 && <WizardSection title="Who is part of this agreement?" copy="The connected wallet is set as buyer. Each role is committed immutably at deployment."><Field label="Buyer wallet" name="buyer" value={form.buyer} update={update} /><Field label="Seller wallet" name="seller" value={form.seller} update={update} placeholder="0x..." /><Field label="Arbitrator" name="arbitrator" value={form.arbitrator} update={update} placeholder="0x..." /></WizardSection>}
    {step === 2 && <WizardSection title="Set the escrow payment" copy="ETH is held by the escrow contract until the agreement reaches a valid settlement state."><div className="asset-select selected"><span className="asset-icon">Ξ</span><div><strong>Ethereum</strong><small>Native asset · {networkName}</small></div><StatusBadge>Selected</StatusBadge></div><Field label="Required amount (ETH)" name="requiredAmountEth" value={form.requiredAmountEth} update={update} type="number" /><details><summary>Advanced deployment settings</summary><Field label="Evidence registry" name="evidenceRegistry" value={form.evidenceRegistry} update={update} /><Field label="Agreement nonce" name="agreementNonce" value={form.agreementNonce} update={update} /></details></WizardSection>}
    {step === 3 && <WizardSection title="Define objective evidence" copy="These rules describe the source-chain payment a verifier must prove. Evidence informs disputes and cannot move funds by itself."><div className="form-two"><Field label="Expected sender" name="expectedSender" value={form.expectedSender} update={update} /><Field label="Expected recipient" name="expectedRecipient" value={form.expectedRecipient || form.seller} update={update} /><Field label="Evidence amount (ETH)" name="evidenceAmountEth" value={form.evidenceAmountEth} update={update} type="number" /><label>Amount rule<select value={form.amountRule} onChange={event => update("amountRule", event.currentTarget.value)}><option value="exact">Exact amount</option><option value="minimum">Minimum amount</option></select></label></div><details><summary>Advanced evidence policy</summary><div className="form-two"><Field label="Source chain key" name="sourceChainKey" value={form.sourceChainKey} update={update} /><label>Asset type<select value={form.assetKind} onChange={event => update("assetKind", event.currentTarget.value)}><option value="native">Native</option><option value="erc20">ERC-20</option></select></label><Field label="Expected source contract" name="expectedSourceContract" value={form.expectedSourceContract} update={update} /><Field label="Expected asset" name="expectedAsset" value={form.expectedAsset} update={update} /><Field label="Minimum source block" name="minSourceBlock" value={form.minSourceBlock} update={update} /><Field label="Maximum source block" name="maxSourceBlock" value={form.maxSourceBlock} update={update} /><Field label="Collector selector" name="calldataSelector" value={form.calldataSelector} update={update} /></div><label className="confirm-check"><input type="checkbox" checked={form.requireTransferEvent} onChange={event => update("requireTransferEvent", event.currentTarget.checked)} /><span>Require ERC-20 Transfer event</span></label></details></WizardSection>}
    {step === 4 && <WizardSection title="Review immutable terms" copy="Confirm every address and policy value before the backend deploys the existing Veyronis escrow contract."><div className="review-grid"><Review label="Buyer" value={draft.buyer} /><Review label="Seller" value={draft.seller} /><Review label="Arbitrator" value={draft.arbitrator} /><Review label="Payment" value={`${form.requiredAmountEth} ETH`} /><Review label="Evidence policy commitment" value={preview?.policy ?? "Invalid"} /><Review label="Agreement commitment" value={preview?.agreement ?? "Invalid"} /></div><aside className="evidence-note"><strong>Evidence remains advisory</strong><span>Verified evidence supports dispute review. It never automatically releases escrowed assets.</span></aside></WizardSection>}
    {step === 5 && <div className="deploy-success"><span>{"\u2713"}</span><h2>{flowResult?.funded ? "Escrow funded" : deploying ? "Step 2 of 2 \u2014 Funding escrow" : "Agreement deployed"}</h2><p>{flowResult?.funded ? "Funding is confirmed. The authoritative contract state is AwaitingDelivery." : deploying ? "Approve the exact required amount from the connected buyer wallet." : "Funding did not complete. The deployed agreement remains saved and can be funded from Live Contracts."}</p><code>{deployed}</code>{agreementId && !deploying && <a className="glass-button primary-button" href={`/dashboard/${agreementId}`}>{flowResult?.funded ? "View Live Contract" : "Fund Contract"}</a>}</div>}
    {error && <p className="form-error" role="alert">{error}</p>}{step < 5 && <div className="wizard-actions">{step > 1 ? <GlassButton onClick={() => setStep(current => current - 1)}>Back</GlassButton> : <span />}<GlassButton className="primary-button" disabled={step === 4 ? deploying || !preview : false} onClick={step === 4 ? () => void deployAndFund() : next}>{step === 4 ? deploying ? flowStage === "deploying" ? "Step 1 of 2 \u2014 Deploying agreement" : "Step 2 of 2 \u2014 Funding escrow" : "Deploy & Fund" : "Continue"}</GlassButton></div>}
  </GlassCard></div></div>;
}
function toWei(value: string) { try { return parseEther(value || "0").toString(); } catch { return ""; } }
function WizardSection({ title, copy, children }: { title: string; copy: string; children: React.ReactNode }) { return <div className="wizard-section"><span className="eyebrow">AGREEMENT SETUP</span><h2>{title}</h2><p>{copy}</p>{children}</div>; }
function Field({ label, name, value, update, placeholder, type = "text" }: { label: string; name: string; value: string; update: (name: string, value: string) => void; placeholder?: string; type?: string }) { return <label>{label}<GlassInput type={type} value={value} placeholder={placeholder} onChange={event => update(name, event.currentTarget.value)} /></label>; }
function Review({ label, value }: { label: string; value: string }) { return <div><span>{label}</span><code>{value}</code></div>; }
