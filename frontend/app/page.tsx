"use client";

import React, { useMemo, useState } from "react";
import { ZeroAddress, hexlify, id, randomBytes } from "ethers";
import {
  computeAgreementCommitment,
  computeEvidencePolicyCommitment,
  validateAgreementDraft,
  type AgreementDraft,
} from "@veyronis/shared";
import { HttpAgreementCreationClient } from "./agreement-client";
import { AgreementReview } from "./agreement-review";

const emptyAddress = "";

export default function Home() {
  const [step, setStep] = useState<"edit" | "review">("edit");
  const [error, setError] = useState("");
  const [deploying, setDeploying] = useState(false);
  const [form, setForm] = useState({
    buyer: emptyAddress,
    seller: emptyAddress,
    arbitrator: emptyAddress,
    evidenceRegistry: emptyAddress,
    requiredAmount: "",
    agreementNonce: "",
    sourceChainKey: "1",
    assetKind: "native",
    expectedSourceContract: ZeroAddress,
    expectedRecipient: emptyAddress,
    expectedAsset: ZeroAddress,
    expectedSender: emptyAddress,
    amountRule: "exact",
    amount: "",
    minSourceBlock: "0",
    maxSourceBlock: "0",
    calldataSelector: "0x00000000",
    requireTransferEvent: false,
  });

  const draft = useMemo(() => buildDraft(form), [form]);
  const preview = useMemo(() => {
    try {
      const valid = validateAgreementDraft(draft);
      const policy = computeEvidencePolicyCommitment(valid.policy);
      return { policy, agreement: computeAgreementCommitment(valid, policy) };
    } catch {
      return undefined;
    }
  }, [draft]);

  const update = (name: string, value: string | boolean) =>
    setForm((current) => ({ ...current, [name]: value }));
  const review = () => {
    try {
      validateAgreementDraft(draft);
      setError("");
      setStep("review");
    } catch {
      setError(
        "Review the highlighted values. Addresses, amounts, and policy fields must be valid.",
      );
    }
  };
  const deploy = async () => {
    const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL;
    if (!backendUrl) {
      setError("Backend deployment orchestration is not configured.");
      return;
    }
    setDeploying(true);
    setError("");
    try {
      const client = new HttpAgreementCreationClient(backendUrl);
      const prepared = await client.prepare(validateAgreementDraft(draft));
      const result = await client.confirmAndDeploy(prepared.id);
      if (result.deploymentStatus !== "DEPLOYED")
        throw new Error("Deployment was not confirmed");
      setError(`Escrow deployed at ${result.escrowAddress}`);
    } catch {
      setError(
        "Deployment did not complete. No escrow is being reported as deployed.",
      );
    } finally {
      setDeploying(false);
    }
  };

  return (
    <main className="shell">
      <header className="topbar">
        <div className="brandMark">V</div>
        <strong>Veyronis</strong>
        <span>Agreement Console</span>
      </header>
      <section className="workspace">
        <div className="titleRow">
          <div>
            <p className="eyebrow">NEW ESCROW AGREEMENT</p>
            <h1>{step === "edit" ? "Create Agreement" : "Review Agreement"}</h1>
          </div>
          <div className="steps">
            <span className="active">1</span>
            <i />
            <span className={step === "review" ? "active" : ""}>2</span>
          </div>
        </div>

        {step === "edit" ? (
          <>
            <FormSection
              title="Participants"
              description="Wallet identities committed to the deployed escrow."
            >
              <Field
                label="Buyer wallet"
                name="buyer"
                value={form.buyer}
                update={update}
              />
              <Field
                label="Seller wallet"
                name="seller"
                value={form.seller}
                update={update}
              />
              <Field
                label="Arbitrator"
                name="arbitrator"
                value={form.arbitrator}
                update={update}
              />
              <Field
                label="Evidence registry"
                name="evidenceRegistry"
                value={form.evidenceRegistry}
                update={update}
              />
              <Field
                label="Required amount (wei)"
                name="requiredAmount"
                value={form.requiredAmount}
                update={update}
              />
              <label>
                <span>Agreement nonce</span>
                <div className="inputAction">
                  <input
                    value={form.agreementNonce}
                    onChange={(e) =>
                      update("agreementNonce", e.currentTarget.value)
                    }
                  />
                  <button
                    type="button"
                    onClick={() =>
                      update("agreementNonce", hexlify(randomBytes(32)))
                    }
                  >
                    Generate
                  </button>
                </div>
              </label>
            </FormSection>

            <FormSection
              title="Evidence Policy"
              description="Objective source-chain facts the verifier must prove."
            >
              <label>
                <span>Evidence type</span>
                <select disabled>
                  <option>Source payment</option>
                </select>
              </label>
              <Field
                label="Source chain key"
                name="sourceChainKey"
                value={form.sourceChainKey}
                update={update}
              />
              <label>
                <span>Asset type</span>
                <select
                  value={form.assetKind}
                  onChange={(e) => update("assetKind", e.currentTarget.value)}
                >
                  <option value="native">Native</option>
                  <option value="erc20">ERC-20</option>
                </select>
              </label>
              <Field
                label="Expected source contract"
                name="expectedSourceContract"
                value={form.expectedSourceContract}
                update={update}
              />
              <Field
                label="Expected sender"
                name="expectedSender"
                value={form.expectedSender}
                update={update}
              />
              <Field
                label="Expected recipient"
                name="expectedRecipient"
                value={form.expectedRecipient}
                update={update}
              />
              <Field
                label="Expected asset"
                name="expectedAsset"
                value={form.expectedAsset}
                update={update}
              />
              <label>
                <span>Amount rule</span>
                <select
                  value={form.amountRule}
                  onChange={(e) => update("amountRule", e.currentTarget.value)}
                >
                  <option value="exact">Exact</option>
                  <option value="minimum">Minimum</option>
                </select>
              </label>
              <Field
                label="Evidence amount"
                name="amount"
                value={form.amount}
                update={update}
              />
              <Field
                label="Minimum source block"
                name="minSourceBlock"
                value={form.minSourceBlock}
                update={update}
              />
              <Field
                label="Maximum source block"
                name="maxSourceBlock"
                value={form.maxSourceBlock}
                update={update}
              />
              <Field
                label="Calldata selector"
                name="calldataSelector"
                value={form.calldataSelector}
                update={update}
              />
              <label className="toggle">
                <input
                  type="checkbox"
                  checked={form.requireTransferEvent}
                  onChange={(e) =>
                    update("requireTransferEvent", e.currentTarget.checked)
                  }
                />
                <span>Require ERC-20 Transfer event</span>
              </label>
            </FormSection>

            <Commitments {...(preview ? { preview } : {})} />
            {error && (
              <p className="error" role="alert">
                {error}
              </p>
            )}
            <div className="actions">
              <button className="primary" onClick={review} disabled={!preview}>
                Review Agreement
              </button>
            </div>
          </>
        ) : (
          <AgreementReview
            draft={draft}
            preview={preview!}
            back={() => setStep("edit")}
            deploy={deploy}
            deploying={deploying}
          />
        )}
        {step === "review" && error && (
          <p className="error" role="status">
            {error}
          </p>
        )}
      </section>
    </main>
  );
}

function buildDraft(form: Record<string, string | boolean>): AgreementDraft {
  return {
    buyer: String(form.buyer),
    seller: String(form.seller),
    arbitrator: String(form.arbitrator),
    evidenceRegistry: String(form.evidenceRegistry),
    requiredAmount: String(form.requiredAmount),
    agreementNonce: String(form.agreementNonce),
    policy: {
      version: 1,
      evidenceType: id("SOURCE_PAYMENT"),
      sourceChainKey: Number(form.sourceChainKey),
      assetKind: form.assetKind as "native" | "erc20",
      expectedSourceContract: String(form.expectedSourceContract),
      expectedRecipient: String(form.expectedRecipient),
      expectedAsset: String(form.expectedAsset),
      expectedSender: String(form.expectedSender),
      amountRule: form.amountRule as "exact" | "minimum",
      amount: String(form.amount),
      minSourceBlock: String(form.minSourceBlock),
      maxSourceBlock: String(form.maxSourceBlock),
      calldataSelector: String(form.calldataSelector),
      requireTransferEvent: Boolean(form.requireTransferEvent),
    },
  };
}

function FormSection({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <section className="section">
      <div className="sectionIntro">
        <h2>{title}</h2>
        <p>{description}</p>
      </div>
      <div className="formGrid">{children}</div>
    </section>
  );
}
function Field({
  label,
  name,
  value,
  update,
}: {
  label: string;
  name: string;
  value: string;
  update: (name: string, value: string) => void;
}) {
  return (
    <label>
      <span>{label}</span>
      <input
        value={value}
        onChange={(event) => update(name, event.currentTarget.value)}
      />
    </label>
  );
}
function Commitments({
  preview,
}: {
  preview?: { policy: string; agreement: string };
}) {
  return (
    <section className="commitments">
      <h2>Commitment Preview</h2>
      <dl>
        <dt>Evidence policy commitment</dt>
        <dd>{preview?.policy ?? "Complete the agreement to generate"}</dd>
        <dt>Agreement commitment</dt>
        <dd>{preview?.agreement ?? "Complete the agreement to generate"}</dd>
      </dl>
    </section>
  );
}
