import React from "react";
import { GlassButton, GlassCard, SectionHeader, StatusBadge } from "./glass";

const content = {
  marketplace: {
    title: "Marketplace",
    description: "Job listings and offers will create Veyronis escrow agreements without bypassing custody rules.",
    cards: ["Post a job", "Browse jobs", "Send an offer", "Review received offers", "Create escrow from accepted offer"],
  },
  proofs: {
    title: "Proofs workspace",
    description: "Verified evidence will connect source transactions, escrow agreements, and portable attestations.",
    cards: ["Submit transaction hash", "Check external transaction", "Attestcoin/Creditcoin status", "Verified proof history", "Dispute evidence workspace"],
  },
  reputation: {
    title: "Verified Reputation",
    description: "Reputation will be derived from verifiable transaction history, never a hidden centralized score.",
    cards: ["Reputation profile", "Verified history", "Arbitrator reputation", "Availability signals"],
  },
  activity: {
    title: "Activity",
    description: "Wallet, escrow, evidence, verification, and attestation events will appear here.",
    cards: ["Wallet activity", "Escrow events", "Evidence reviews", "Verification history"],
  },
} as const;

export function PlaceholderModule({
  kind,
  onHome,
}: {
  kind: keyof typeof content;
  onHome: () => void;
}) {
  const section = content[kind];
  return <div className="module-page">
    <SectionHeader
      eyebrow="VEYRONIS NETWORK"
      title={section.title}
      action={<div className="header-actions"><StatusBadge>Preview</StatusBadge><GlassButton onClick={onHome}>Home</GlassButton></div>}
    />
    <GlassCard className="empty-module">
      <div className="empty-symbol">{kind === "proofs" ? "✓" : kind === "reputation" ? "◎" : kind === "activity" ? "↗" : "▦"}</div>
      <h2>{section.title} is taking shape</h2>
      <p>{section.description}</p>
      <span>Coming next</span>
    </GlassCard>
    <div className="preview-card-grid">
      {section.cards.map(card => <GlassCard key={card} className="preview-card"><strong>{card}</strong><StatusBadge>Coming next</StatusBadge></GlassCard>)}
    </div>
    {kind === "marketplace" && <ArbitratorServicesPreview />}
    {kind === "proofs" && <GlassCard className="safety-card">
      <h3>Proof safety</h3>
      <p>A transaction hash alone is not entitlement to escrow funds. Future payouts must remain bound to the correct agreement, condition, sender, recipient, asset, amount, source chain, contract settlement rules, and authorized buyer or arbitrator settlement action.</p>
      <StatusBadge tone="amber">No automatic payout</StatusBadge>
    </GlassCard>}
  </div>;
}

function ArbitratorServicesPreview() {
  const cards = [
    "Become an arbitrator",
    "Create arbitrator profile",
    "Set availability",
    "Display reputation",
    "Review dispute assignments",
    "View service fee policy",
    "Accept or decline assignments",
  ];
  return <section className="preview-section">
    <header><div><span className="eyebrow">ARBITRATOR SERVICES</span><h2>Arbitrator marketplace preview</h2></div><StatusBadge>In development</StatusBadge></header>
    <p>Arbitrator registration, profiles, availability, assignments, and fee policy are planned. Fee collection and marketplace logic are not active yet.</p>
    <div className="preview-card-grid">
      {cards.map(card => <GlassCard key={card} className="preview-card"><strong>{card}</strong><StatusBadge>Coming next</StatusBadge></GlassCard>)}
    </div>
  </section>;
}
