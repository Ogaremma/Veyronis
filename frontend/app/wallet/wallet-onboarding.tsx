"use client";
import { useMemo, useState } from "react";
import { Wallet, type HDNodeWallet } from "ethers";
import { walletFromPhrase } from "../page";
import { GlassButton, GlassCard, GlassInput } from "../ui/glass";

type View = "welcome" | "phrase" | "verify" | "restore";
export function WalletOnboarding({ onUnlock }: { onUnlock: (wallet: HDNodeWallet) => Promise<void> }) {
  const [view, setView] = useState<View>("welcome");
  const [phrase, setPhrase] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [copied, setCopied] = useState(false);
  const [answers, setAnswers] = useState<Record<number, string>>({});
  const [words, setWords] = useState<string[]>(Array(12).fill(""));
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const positions = useMemo(() => phrase ? pickPositions(phrase) : [], [phrase]);

  function create() {
    const generated = Wallet.createRandom().mnemonic?.phrase;
    if (!generated) return;
    setPhrase(generated); setConfirmed(false); setCopied(false); setAnswers({}); setView("phrase");
  }
  async function unlock(value: string) {
    setBusy(true); setError("");
    try { await onUnlock(walletFromPhrase(value)); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "Unable to unlock wallet"); }
    finally { setBusy(false); }
  }
  function verify() {
    const source = phrase.split(" ");
    if (positions.every(position => answers[position]?.trim().toLowerCase() === source[position - 1])) void unlock(phrase);
    else setError("One or more words do not match your recovery phrase");
  }
  function pastePhrase(value: string) {
    const pasted = value.trim().toLowerCase().split(/\s+/);
    if (pasted.length === 12) setWords(pasted);
  }
  if (view === "welcome") return <OnboardingFrame><div className="welcome-copy"><span className="onboarding-mark">V</span><p className="eyebrow">SELF-CUSTODIAL TRUST</p><h1>VEYRONIS</h1><p>Trust between strangers, backed by verifiable evidence.</p></div><GlassCard className="welcome-actions"><h2>Enter your wallet</h2><p>Your keys remain in this browser session and under your control.</p><GlassButton className="primary-button" onClick={create}>Create a new wallet</GlassButton><GlassButton onClick={() => setView("restore")}>I already have a wallet</GlassButton><small>Veyronis never receives your recovery phrase.</small></GlassCard></OnboardingFrame>;
  if (view === "phrase") return <OnboardingFrame compact><FlowHeader step="01 / 02" title="Your Secret Recovery Phrase" copy="Write these words down in order. They are the only way to restore this wallet." /><GlassCard className="phrase-card"><div className="phrase-toolbar"><span>12-word recovery phrase</span><button aria-label="Copy recovery phrase" onClick={async () => { await navigator.clipboard.writeText(phrase); setCopied(true); window.setTimeout(() => setCopied(false), 1600); }}>{copied ? "Copied" : "Copy"}</button></div><div className="phrase-grid">{phrase.split(" ").map((word, index) => <div key={word}><span>{String(index + 1).padStart(2, "0")}</span><strong>{word}</strong></div>)}</div></GlassCard><label className="confirm-check"><input type="checkbox" checked={confirmed} onChange={event => setConfirmed(event.currentTarget.checked)} /><span>I&apos;ve copied my seed phrase and saved it securely</span></label><div className="flow-actions"><GlassButton onClick={() => setView("welcome")}>Back</GlassButton><GlassButton className="primary-button" disabled={!confirmed} onClick={() => setView("verify")}>Continue</GlassButton></div></OnboardingFrame>;
  if (view === "verify") return <OnboardingFrame compact><FlowHeader step="02 / 02" title="Verify your recovery phrase" copy="Enter the requested words to confirm your backup is accurate." /><GlassCard className="verify-card">{positions.map(position => <label key={position}><span>Enter word #{position}</span><GlassInput autoComplete="off" value={answers[position] ?? ""} onChange={event => setAnswers(current => ({ ...current, [position]: event.currentTarget.value }))} /></label>)}</GlassCard>{error && <p className="form-error" role="alert">{error}</p>}<div className="flow-actions"><GlassButton onClick={() => setView("phrase")}>Back</GlassButton><GlassButton className="primary-button" disabled={busy} onClick={verify}>{busy ? "Creating wallet..." : "Create wallet"}</GlassButton></div></OnboardingFrame>;
  return <OnboardingFrame compact><FlowHeader step="RESTORE WALLET" title="Enter your recovery phrase" copy="Your phrase is validated and used only in this browser session." /><GlassCard className="restore-card"><div className="word-inputs">{words.map((word, index) => <label key={index}><span>{String(index + 1).padStart(2, "0")}</span><input value={word} autoComplete="off" autoCorrect="off" spellCheck={false} onPaste={index === 0 ? event => { const text = event.clipboardData.getData("text"); if (text.trim().split(/\s+/).length === 12) { event.preventDefault(); pastePhrase(text); } } : undefined} onChange={event => { const value = event.currentTarget.value; if (value.trim().split(/\s+/).length === 12) pastePhrase(value); else setWords(current => current.map((item, itemIndex) => itemIndex === index ? value.toLowerCase() : item)); }} /></label>)}</div><p>Paste all 12 words into the first field to fill the phrase automatically.</p></GlassCard>{error && <p className="form-error" role="alert">Invalid recovery phrase</p>}<div className="flow-actions"><GlassButton onClick={() => { setError(""); setView("welcome"); }}>Back</GlassButton><GlassButton className="primary-button" disabled={busy || words.some(word => !word.trim())} onClick={() => void unlock(words.join(" "))}>{busy ? "Restoring..." : "Restore wallet"}</GlassButton></div></OnboardingFrame>;
}
function pickPositions(phrase: string) { let seed = phrase.split("").reduce((sum, char) => sum + char.charCodeAt(0), 0); const values = new Set<number>(); while (values.size < 3) { seed = (seed * 9301 + 49297) % 233280; values.add(Math.floor(seed / 233280 * 12) + 1); } return [...values].sort((a, b) => a - b); }
function OnboardingFrame({ children, compact = false }: { children: React.ReactNode; compact?: boolean }) { return <main className={`onboarding ${compact ? "onboarding-compact" : ""}`}><div className="ambient-grid" /><div className="onboarding-inner">{children}</div><footer>Self-custodial · Local network · Verifiable evidence</footer></main>; }
function FlowHeader({ step, title, copy }: { step: string; title: string; copy: string }) { return <header className="flow-header"><button className="mini-brand">V</button><span className="eyebrow">{step}</span><h1>{title}</h1><p>{copy}</p></header>; }
