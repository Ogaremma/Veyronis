"use client";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useAccount } from "wagmi";
import { ZeroAddress, formatEther, hexlify, id, parseEther, parseUnits, randomBytes } from "ethers";
import { computeAgreementCommitment, computeEvidencePolicyCommitment, validateAgreementDraft, type AgreementDeliverable, type AgreementDiscoveryItem, type AgreementDraft } from "@veyronis/shared";
import { HttpAgreementCreationClient } from "../agreement-client";
import { requiredTransactionChainId, transactionNetworkError } from "../transaction-network-guard";
import {
  discoveryAction,
  discoveryCounterparty,
  discoveryDisplayStatus,
  isClosedDiscoveryAgreement,
  roleForDiscoveryAgreement,
  roleLabel,
} from "./agreement-status";
import { deployAndFundAgreement, type DeployAndFundResult, type DeployAndFundStage } from "./deploy-and-fund-flow";
import { fundEscrow } from "./escrow-funding";
import { DeliverablesEditor, EvidenceRequirementsEditor } from "./agreement-terms-editor";
import { agreementWizardSteps, previousWizardStep, wizardBackLabel } from "./wizard-flow";
import { GlassButton, GlassCard, GlassInput, SectionHeader, StatusBadge } from "../ui/glass";

const API = process.env.NEXT_PUBLIC_BACKEND_URL as string;
const REGISTRY = (process.env.NEXT_PUBLIC_EVIDENCE_REGISTRY_ADDRESS ?? process.env.NEXT_PUBLIC_VEYRONIS_EVIDENCE_REGISTRY_ADDRESS) as string;
type AgreementItem = AgreementDiscoveryItem;
type WalletConnector = { getProvider(): Promise<unknown> } | undefined;
type ConditionMode = "work" | "external" | "both";

interface WizardForm {
  buyer: string;
  seller: string;
  arbitrator: string;
  evidenceRegistry: string;
  requiredAmountEth: string;
  agreementNonce: string;
  conditionMode: ConditionMode;
  sourceChainKey: string;
  assetKind: "native" | "erc20";
  tokenContract: string;
  expectedRecipient: string;
  expectedSender: string;
  amountRule: "exact" | "minimum";
  conditionAmount: string;
  conditionDecimals: string;
  minSourceBlock: string;
  maxSourceBlock: string;
  deliverables: AgreementDeliverable[];
}

export function EscrowModule({ walletAddress, networkName }: { walletAddress: string; networkName: string }) {
  const { chainId, connector } = useAccount();
  const [creating, setCreating] = useState(false);
  const [items, setItems] = useState<AgreementItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const load = useCallback(async () => {
    setLoading(true); setError("");
    try {
      const response = await fetch(`${API}/agreements/discovery`, { cache: "no-store" });
      if (!response.ok) throw new Error(`Unable to load live contracts (HTTP ${response.status}).`);
      setItems(await response.json());
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Unable to load live contracts because the request failed.");
    } finally { setLoading(false); }
  }, []);
  useEffect(() => { void load(); }, [load]);
  const liveItems = items.filter(item => !isClosedDiscoveryAgreement(item));
  const closedItems = items.filter(isClosedDiscoveryAgreement);
  const awaitingPayment = liveItems.filter(item => discoveryDisplayStatus(item) === "AwaitingPayment").length;
  const awaitingDelivery = liveItems.filter(item => discoveryDisplayStatus(item) === "AwaitingDelivery").length;
  const disputed = liveItems.filter(item => discoveryDisplayStatus(item) === "Disputed").length;
  if (creating) return <EscrowWizard walletAddress={walletAddress} networkName={networkName} chainId={chainId} connector={connector as WalletConnector} close={() => { setCreating(false); void load(); }} />;
  return <div className="module-page"><SectionHeader eyebrow="PERSISTENT AGREEMENTS" title="Live Contracts" action={<GlassButton className="primary-button" onClick={() => setCreating(true)}>+ Create Escrow</GlassButton>} />
    <div className="metric-grid"><Metric label="Live contracts" value={liveItems.length} /><Metric label="Awaiting payment" value={awaitingPayment} /><Metric label="Awaiting delivery" value={awaitingDelivery} /><Metric label="Closed" value={closedItems.length} /><Metric label="Disputed" value={disputed} tone="amber" /></div>
    <GlassCard className="agreement-table"><div className="table-title"><div><h2>Live Contracts</h2><p>Deployed agreements are publicly discoverable. Actions require the matching participant wallet.</p></div><StatusBadge>{liveItems.length} live</StatusBadge></div>{loading ? <div className="empty-agreements"><span className="escrow-icon">{"\u25c7"}</span><h3>Loading live contracts...</h3></div> : error ? <p className="form-error" role="alert">{error}</p> : liveItems.length ? liveItems.map(item => <AgreementCard item={item} walletAddress={walletAddress} key={item.id} />) : <div className="empty-agreements"><span className="escrow-icon">{"\u25c7"}</span><h3>No live contracts</h3><p>Deployed agreements are visible to everyone; role actions require the matching wallet.</p><GlassButton onClick={() => setCreating(true)}>Create Escrow</GlassButton></div>}</GlassCard>
    <GlassCard className="agreement-table closed-contracts"><div className="table-title"><div><h2>Closed / Completed Contracts</h2><p>Historical agreements are retained for audit and review.</p></div><StatusBadge tone="green">{closedItems.length} closed</StatusBadge></div>{!loading && !error && closedItems.length ? closedItems.map(item => <AgreementCard item={item} walletAddress={walletAddress} key={item.id} />) : <div className="empty-agreements"><span className="escrow-icon">{"\u25c7"}</span><h3>No closed contracts</h3><p>Completed, refunded, and cancelled agreements will appear here.</p></div>}</GlassCard>
  </div>;
}
function Metric({ label, value, tone }: { label: string; value: number; tone?: "amber" }) { return <GlassCard className="metric"><span>{label}</span><strong>{value}</strong>{tone && <i />}</GlassCard>; }
function formatAmount(value: string) { try { return formatEther(value); } catch { return value; } }

function AgreementCard({ item, walletAddress }: { item: AgreementItem; walletAddress: string }) {
  const role = roleForDiscoveryAgreement(item, walletAddress);
  return <a className="agreement-item" href={`/dashboard/${item.id}`}>
    <span className="escrow-icon">{"\u25c7"}</span>
    <div><strong>{item.escrowAddress.slice(0, 12)}...{item.escrowAddress.slice(-6)}</strong><small>{item.network} · {role ? roleLabel(role) : "Read only"} · {discoveryCounterparty(item, role)} · {formatAmount(item.requiredAmount)} ETH</small></div>
    <StatusBadge tone={discoveryDisplayStatus(item) === "Disputed" ? "amber" : isClosedDiscoveryAgreement(item) ? "green" : "blue"}>{discoveryDisplayStatus(item)}</StatusBadge>
    <span className="agreement-action">{discoveryAction(item, role)}</span>
  </a>;
}

function EscrowWizard({ walletAddress, networkName, chainId, connector, close }: { walletAddress: string; networkName: string; chainId: number | undefined; connector: WalletConnector; close: () => void }) {
  const [step, setStep] = useState(1); const [error, setError] = useState(""); const [deploying, setDeploying] = useState(false); const [deployed, setDeployed] = useState(""); const [agreementId, setAgreementId] = useState(""); const [flowStage, setFlowStage] = useState<DeployAndFundStage>("deploying"); const [flowResult, setFlowResult] = useState<DeployAndFundResult>();
  const [form, setForm] = useState<WizardForm>({
    buyer: walletAddress,
    seller: "",
    arbitrator: "",
    evidenceRegistry: REGISTRY,
    requiredAmountEth: "0.1",
    agreementNonce: hexlify(randomBytes(32)),
    conditionMode: "work",
    sourceChainKey: "1",
    assetKind: "erc20",
    tokenContract: "",
    expectedRecipient: "",
    expectedSender: "",
    amountRule: "exact",
    conditionAmount: "100",
    conditionDecimals: "6",
    minSourceBlock: "0",
    maxSourceBlock: "0",
    deliverables: [],
  });
  const update = (name: string, value: string | boolean) => setForm(current => ({ ...current, [name]: value }));
  const draft = useMemo<AgreementDraft>(() => {
    const externalCondition = form.conditionMode !== "work";
    const erc20 = form.assetKind === "erc20";
    return {
      buyer: form.buyer,
      seller: form.seller,
      arbitrator: form.arbitrator,
      evidenceRegistry: form.evidenceRegistry,
      requiredAmount: toWei(form.requiredAmountEth),
      agreementNonce: form.agreementNonce,
      deliverables: form.deliverables,
      policy: externalCondition ? {
        version: 1,
        evidenceType: id("SOURCE_PAYMENT"),
        sourceChainKey: Number(form.sourceChainKey),
        assetKind: form.assetKind as "native" | "erc20",
        expectedSourceContract: erc20 ? form.tokenContract : ZeroAddress,
        expectedRecipient: form.expectedRecipient || form.buyer,
        expectedAsset: erc20 ? form.tokenContract : ZeroAddress,
        expectedSender: form.expectedSender || form.seller,
        amountRule: form.amountRule as "exact" | "minimum",
        amount: toConditionUnits(form.conditionAmount, form.conditionDecimals),
        minSourceBlock: form.minSourceBlock,
        maxSourceBlock: form.maxSourceBlock,
        calldataSelector: erc20 ? "0xa9059cbb" : "0x00000000",
        requireTransferEvent: erc20,
      } : {
        version: 1,
        evidenceType: id("BLOCKCHAIN_VERIFICATION_DISABLED"),
        sourceChainKey: 1,
        assetKind: "native",
        expectedSourceContract: ZeroAddress,
        expectedRecipient: form.seller,
        expectedAsset: ZeroAddress,
        expectedSender: form.buyer,
        amountRule: "exact",
        amount: toWei(form.requiredAmountEth),
        minSourceBlock: "0",
        maxSourceBlock: "0",
        calldataSelector: "0x00000000",
        requireTransferEvent: false,
      },
    };
  }, [form]);
  const preview = useMemo(() => { try { const valid = validateAgreementDraft(draft); const policy = computeEvidencePolicyCommitment(valid.policy); return { policy, agreement: computeAgreementCommitment(valid, policy) }; } catch { return undefined; } }, [draft]);
  function next() {
    setError("");
    if (step === 1 && (!form.buyer || !form.seller || !form.arbitrator)) return setError("Enter all participant wallet addresses");
    if (step === 2 && (!form.requiredAmountEth || Number(form.requiredAmountEth) <= 0)) return setError("Enter a valid payment amount");
    if (step === 3) {
      const activeDeliverables = form.deliverables.filter((deliverable) => deliverable.active);
      if (form.conditionMode !== "external" && activeDeliverables.length === 0)
        return setError("Add at least one active deliverable");
      if (activeDeliverables.some((deliverable) => !deliverable.title.trim())) return setError("Enter a title for every active deliverable");
    }
    if (step === 4) {
      const activeDeliverables = form.deliverables.filter((deliverable) => deliverable.active);
      if (activeDeliverables.some((deliverable) => deliverable.evidenceRequirements.length === 0)) return setError("Add at least one evidence requirement to every active deliverable");
      if (activeDeliverables.some((deliverable) => deliverable.evidenceRequirements.some((requirement) => !requirement.label.trim()))) return setError("Enter a label for every evidence requirement");
    }
    if (step === 5 && form.conditionMode !== "work" && !preview)
      return setError("Complete the external blockchain condition");
    setStep(current => Math.min(agreementWizardSteps.length, current + 1));
  }
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
          setAgreementId(deployedAgreement.id); setDeployed(deployedAgreement.escrowAddress); setStep(agreementWizardSteps.length);
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
  return <div className="module-page wizard-page"><SectionHeader eyebrow="NEW ESCROW" title={step === agreementWizardSteps.length && flowResult ? "Agreement deployed" : "Create Escrow"} action={<button className="text-button" onClick={close} disabled={deploying}>Close</button>} /><div className="wizard-layout"><aside className="wizard-steps">{agreementWizardSteps.map((label, index) => <div className={step === index + 1 ? "current" : step > index + 1 ? "done" : ""} key={label}><span>{step > index + 1 ? "✓" : index + 1}</span><div><strong>{label}</strong><small>{index === 0 ? "Wallet roles" : index === 1 ? "Asset and amount" : index === 2 ? "What is delivered" : index === 3 ? "Proof of delivery" : index === 4 ? "Cross-chain facts" : index === 5 ? "Immutable terms" : "Two wallet transactions"}</small></div></div>)}</aside><GlassCard className="wizard-card">
    {step === 1 && <WizardSection title="Who is part of this agreement?" copy="The connected wallet is set as buyer. Each role is committed immutably at deployment."><Field label="Buyer wallet" name="buyer" value={form.buyer} update={update} /><Field label="Seller wallet" name="seller" value={form.seller} update={update} placeholder="0x..." /><Field label="Arbitrator" name="arbitrator" value={form.arbitrator} update={update} placeholder="0x..." /></WizardSection>}
    {step === 2 && <WizardSection title="Set the escrow payment" copy="ETH is held by the escrow contract until the agreement reaches a valid settlement state."><div className="asset-select selected"><span className="asset-icon">Ξ</span><div><strong>Ethereum</strong><small>Native asset · {networkName}</small></div><StatusBadge>Selected</StatusBadge></div><Field label="Required amount (ETH)" name="requiredAmountEth" value={form.requiredAmountEth} update={update} type="number" /><details><summary>Advanced deployment settings</summary><Field label="Evidence registry" name="evidenceRegistry" value={form.evidenceRegistry} update={update} /><Field label="Agreement nonce" name="agreementNonce" value={form.agreementNonce} update={update} /></details></WizardSection>}
    {step === 3 && <WizardSection title="Delivery & Evidence" copy="Define what the seller must deliver and what they must provide to prove completion."><DeliverablesEditor deliverables={form.deliverables} onChange={deliverables => setForm(current => ({ ...current, deliverables }))} /></WizardSection>}
    {step === 4 && <WizardSection title="Evidence Requirements" copy="These are application-level proofs for delivery. Buyers and arbitrators review them manually."><EvidenceRequirementsEditor deliverables={form.deliverables} onChange={deliverables => setForm(current => ({ ...current, deliverables }))} /></WizardSection>}
    {step === 5 && <AgreementConditionsStep form={form} update={update} />}
    {step === 6 && <ReviewStep form={form} draft={draft} preview={preview} />}
    {step === 7 && <div className="deploy-success"><span>{"\u2713"}</span><h2>{flowResult?.funded ? "Escrow funded" : deploying ? flowStage === "deploying" ? "Step 1 of 2 \u2014 Deploying agreement" : "Step 2 of 2 \u2014 Funding escrow" : "Ready to deploy and fund"}</h2><p>{flowResult?.funded ? "Funding is confirmed. The authoritative contract state is AwaitingDelivery." : deploying ? "Approve the exact required amount from the connected buyer wallet." : flowResult ? "Funding did not complete. The deployed agreement remains saved and can be funded from Live Contracts." : "The backend deploys the agreement first, then the connected buyer wallet funds the exact required amount."}</p>{deployed && <code>{deployed}</code>}{agreementId && !deploying && <a className="glass-button primary-button" href={`/dashboard/${agreementId}`}>{flowResult?.funded ? "View Live Contract" : "Fund Contract"}</a>}</div>}
    {error && <p className="form-error" role="alert">{error}</p>}<div className="wizard-actions">{wizardBackLabel(step, false) && <GlassButton disabled={deploying || Boolean(agreementId)} onClick={step === 1 ? close : () => setStep(previousWizardStep(step))}>{wizardBackLabel(step, false)}</GlassButton>}<GlassButton className="primary-button" disabled={step === agreementWizardSteps.length ? deploying || !preview || Boolean(agreementId) : false} onClick={step === agreementWizardSteps.length ? () => void deployAndFund() : next}>{step === agreementWizardSteps.length ? deploying ? flowStage === "deploying" ? "Step 1 of 2 \u2014 Deploying agreement" : "Step 2 of 2 \u2014 Funding escrow" : "Deploy & Fund" : "Continue"}</GlassButton></div>
  </GlassCard></div></div>;
}
function toWei(value: string) { try { return parseEther(value || "0").toString(); } catch { return ""; } }
function WizardSection({ title, copy, children }: { title: string; copy: string; children: React.ReactNode }) { return <div className="wizard-section"><span className="eyebrow">AGREEMENT SETUP</span><h2>{title}</h2><p>{copy}</p>{children}</div>; }
function Field({ label, name, value, update, placeholder, type = "text" }: { label: string; name: string; value: string; update: (name: string, value: string) => void; placeholder?: string; type?: string }) { return <label>{label}<GlassInput type={type} value={value} placeholder={placeholder} onChange={event => update(name, event.currentTarget.value)} /></label>; }
function Review({ label, value }: { label: string; value: string }) { return <div><span>{label}</span><code>{value}</code></div>; }

function AgreementConditionsStep({
  form,
  update,
}: {
  form: WizardForm;
  update: (name: string, value: string | boolean) => void;
}) {
  const external = form.conditionMode !== "work";
  const erc20 = form.assetKind === "erc20";

  function updateAssetKind(value: string) {
    update("assetKind", value);
    update("conditionDecimals", value === "native" ? "18" : "6");
  }

  return (
    <WizardSection
      title="Agreement Conditions"
      copy="Choose what must be satisfied before settlement. Work conditions are reviewed manually; external blockchain conditions are verified by Attestcoin on Creditcoin."
    >
      <div className="condition-mode">
        <label>
          <input
            type="radio"
            name="conditionMode"
            checked={form.conditionMode === "work"}
            onChange={() => update("conditionMode", "work")}
          />
          <span><strong>Work / Delivery</strong><small>Define what the seller must deliver.</small></span>
        </label>
        <label>
          <input
            type="radio"
            name="conditionMode"
            checked={form.conditionMode === "external"}
            onChange={() => update("conditionMode", "external")}
          />
          <span><strong>External Blockchain Action</strong><small>Require a verifiable action on another blockchain.</small></span>
        </label>
        <label>
          <input
            type="radio"
            name="conditionMode"
            checked={form.conditionMode === "both"}
            onChange={() => update("conditionMode", "both")}
          />
          <span><strong>Both</strong><small>Require delivery and an external blockchain action.</small></span>
        </label>
      </div>
      {external && (
        <>
          <div className="form-two">
            <label>Source chain<select value={form.sourceChainKey} onChange={event => update("sourceChainKey", event.currentTarget.value)}><option value="1">Sepolia (Attestcoin key 1)</option></select></label>
            <label>
              Asset type
              <select value={form.assetKind} onChange={(event) => updateAssetKind(event.currentTarget.value)}>
                <option value="erc20">ERC-20 transfer</option>
                <option value="native">Native transfer</option>
              </select>
            </label>
            {erc20 && (
              <Field label="Token contract" name="tokenContract" value={form.tokenContract} update={update} placeholder="0x..." />
            )}
            <Field label="Sender (seller)" name="expectedSender" value={form.expectedSender || form.seller} update={update} />
            <Field label="Recipient (buyer)" name="expectedRecipient" value={form.expectedRecipient || form.buyer} update={update} />
            <Field label="Amount" name="conditionAmount" value={form.conditionAmount} update={update} type="number" />
            <Field label="Amount decimals" name="conditionDecimals" value={form.conditionDecimals} update={update} type="number" />
            <label>
              Amount rule
              <select value={form.amountRule} onChange={(event) => update("amountRule", event.currentTarget.value)}>
                <option value="exact">Exact amount</option>
                <option value="minimum">Minimum amount</option>
              </select>
            </label>
          </div>
          <details>
            <summary>Advanced source-block rules</summary>
            <div className="form-two">
              <Field label="Minimum source block" name="minSourceBlock" value={form.minSourceBlock} update={update} />
              <Field label="Maximum source block" name="maxSourceBlock" value={form.maxSourceBlock} update={update} />
            </div>
          </details>
        </>
      )}
      <aside className="evidence-note">
        <strong>Blockchain facts only</strong>
        <span>Attestcoin and Creditcoin verify objective blockchain transactions. They do not verify photographs, files, websites, GitHub work, or physical delivery quality.</span>
      </aside>
    </WizardSection>
  );
}

function ReviewStep({
  form,
  draft,
  preview,
}: {
  form: WizardForm;
  draft: AgreementDraft;
  preview: { policy: string; agreement: string } | undefined;
}) {
  const external = form.conditionMode !== "work";
  return (
    <WizardSection
      title="Review immutable terms"
      copy="Confirm every participant, condition, deliverable, and evidence requirement before deployment."
    >
      <div className="review-grid">
        <Review label="Buyer" value={draft.buyer} />
        <Review label="Seller" value={draft.seller} />
        <Review label="Arbitrator" value={draft.arbitrator} />
        <Review label="Payment" value={`${form.requiredAmountEth} ETH`} />
        <Review label="Conditions" value={conditionReviewLabel(form.conditionMode)} />
        <Review label="Agreement commitment" value={preview?.agreement ?? "Invalid"} />
      </div>
      {external && (
        <div className="review-grid">
          <Review label="Source chain key" value={form.sourceChainKey} />
          <Review label="External asset" value={form.assetKind === "erc20" ? form.tokenContract : "Native asset"} />
          <Review label="Sender" value={form.expectedSender || form.seller} />
          <Review label="Recipient" value={form.expectedRecipient || form.buyer} />
          <Review label="Amount" value={`${form.conditionAmount} / ${form.conditionDecimals} decimals`} />
          <Review label="Amount rule" value={form.amountRule} />
        </div>
      )}
      <div className="deliverable-review">
        {form.deliverables.filter((deliverable) => deliverable.active).map((deliverable) => (
          <div key={deliverable.id}>
            <strong>{deliverable.title}</strong>
            <small>{deliverable.required ? "Required" : "Optional"} · {deliverable.description || "No description"}</small>
            <ul>
              {deliverable.evidenceRequirements.map((requirement) => (
                <li key={requirement.id}>
                  {requirement.label} · {requirement.kind.replaceAll("_", " ")} · {requirement.required ? "Required" : "Optional"}
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
      <aside className="evidence-note">
        <strong>Verification does not settle automatically</strong>
        <span>Work evidence and verified blockchain conditions support review. Escrow settlement remains governed by the existing escrow lifecycle.</span>
      </aside>
    </WizardSection>
  );
}

function conditionReviewLabel(mode: ConditionMode) {
  if (mode === "external") return "External blockchain action";
  if (mode === "both") return "Work / delivery and external blockchain action";
  return "Work / delivery";
}

function toConditionUnits(value: string, decimals: string) {
  try {
    return parseUnits(value || "0", Number(decimals)).toString();
  } catch {
    return "";
  }
}
