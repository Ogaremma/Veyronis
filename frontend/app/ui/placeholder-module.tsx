import { GlassCard, SectionHeader, StatusBadge } from "./glass";

const content = {
  marketplace: ["Marketplace", "Listings and offers will create Veyronis escrow agreements without bypassing custody rules."],
  proofs: ["Transaction Proofs", "Verified evidence will connect source transactions, escrow agreements, and portable attestations."],
  reputation: ["Verified Reputation", "Reputation will be derived from verifiable transaction history, never a hidden centralized score."],
  activity: ["Activity", "Wallet, escrow, evidence, verification, and attestation events will appear here."],
} as const;
export function PlaceholderModule({ kind }: { kind: keyof typeof content }) {
  const [title, description] = content[kind];
  return <div className="module-page"><SectionHeader eyebrow="VEYRONIS NETWORK" title={title} action={<StatusBadge>Preview</StatusBadge>} /><GlassCard className="empty-module"><div className="empty-symbol">{kind === "proofs" ? "✓" : kind === "reputation" ? "◎" : kind === "activity" ? "↗" : "▦"}</div><h2>{title} is taking shape</h2><p>{description}</p><span>Coming in the next product phase</span></GlassCard></div>;
}
