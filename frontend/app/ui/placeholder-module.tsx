import React from "react";
import { GlassButton, GlassCard, SectionHeader, StatusBadge } from "./glass";

const content = {
  marketplace: {
    title: "Marketplace",
    description:
      "Job listings and offers will create Veyronis escrow agreements without bypassing custody rules.",
    cards: [
      "Post a job",
      "Browse jobs",
      "Send an offer",
      "Review received offers",
      "Create escrow from accepted offer",
    ],
  },
  proofs: {
    title: "Proofs workspace",
    description:
      "Verified evidence will connect source transactions, escrow agreements, and portable attestations.",
    cards: [
      "Submit transaction hash",
      "Check external transaction",
      "Attestcoin/Creditcoin status",
      "Verified proof history",
      "Dispute evidence workspace",
    ],
  },
  reputation: {
    title: "Verified Reputation",
    description:
      "Reputation will be derived from verifiable transaction history, never a hidden centralized score.",
    cards: [
      "Reputation profile",
      "Verified history",
      "Arbitrator reputation",
      "Availability signals",
    ],
  },
  activity: {
    title: "Activity",
    description:
      "Wallet, escrow, evidence, verification, and attestation events will appear here.",
    cards: [
      "Wallet activity",
      "Escrow events",
      "Evidence reviews",
      "Verification history",
    ],
  },
} as const;

export function PlaceholderModule({
  kind,
  onHome,
}: {
  kind: keyof typeof content;
  onHome: () => void;
}) {
  if (kind === "proofs") return <ProofsWorkspace onHome={onHome} />;
  const section = content[kind];
  return (
    <div className="module-page">
      <SectionHeader
        eyebrow="VEYRONIS NETWORK"
        title={section.title}
        action={
          <div className="header-actions">
            <StatusBadge>Preview</StatusBadge>
            <GlassButton onClick={onHome}>Home</GlassButton>
          </div>
        }
      />
      <GlassCard className="empty-module">
        <div className="empty-symbol">{symbolFor(kind)}</div>
        <h2>{section.title} is taking shape</h2>
        <p>{section.description}</p>
        <span>Coming next</span>
      </GlassCard>
      <div className="preview-card-grid">
        {section.cards.map((card) => (
          <GlassCard key={card} className="preview-card">
            <strong>{card}</strong>
            <StatusBadge>Coming next</StatusBadge>
          </GlassCard>
        ))}
      </div>
      {kind === "marketplace" && <ArbitratorServicesPreview />}
    </div>
  );
}

function symbolFor(kind: keyof typeof content) {
  if (kind === "reputation") return "\u25ce";
  if (kind === "activity") return "\u2197";
  return "\u25a6";
}

function ProofsWorkspace({ onHome }: { onHome: () => void }) {
  const pipeline = [
    {
      title: "Seller submits a transaction hash",
      copy: "The hash is a lookup reference. It never authorizes settlement by itself.",
    },
    {
      title: "Attestcoin and Creditcoin verify transaction facts",
      copy: "Verification covers blockchain inclusion, success, sender, recipient, asset, and amount.",
    },
    {
      title: "Authorized verifier submits a registry claim",
      copy: "The claim is bound to the agreement, policy, evidence, source chain, and subject.",
    },
    {
      title: "Registry validates and applies the lifecycle",
      copy: "Blockchain-only conditions settle directly; hybrid conditions record the prerequisite and wait for buyer acceptance.",
    },
    {
      title: "Seller withdraws after contract credit",
      copy: "The withdrawable balance is read from the escrow contract, never inferred from proof status.",
    },
  ];

  return (
    <div className="module-page">
      <SectionHeader
        eyebrow="PROOFS WORKSPACE"
        title="Verification Center"
        action={
          <div className="header-actions">
            <StatusBadge tone="green">Authorized path</StatusBadge>
            <GlassButton onClick={onHome}>Home</GlassButton>
          </div>
        }
      />
      <GlassCard className="verification-center">
        <div className="verification-hero">
          <span className="verification-orb" aria-hidden="true" />
          <div>
            <h2>Blockchain condition verification</h2>
            <p>
              Attestcoin and Creditcoin verify the specified source transaction.
              Veyronis then uses the authorized verifier and immutable registry
              before escrow settlement.
            </p>
          </div>
        </div>
        <ol className="verification-pipeline">
          {pipeline.map((step, index) => (
            <li key={step.title}>
              <span>{index + 1}</span>
              <div>
                <strong>{step.title}</strong>
                <p>{step.copy}</p>
              </div>
            </li>
          ))}
        </ol>
      </GlassCard>
      <div className="preview-card-grid verification-limits">
        <GlassCard className="preview-card">
          <strong>Application evidence</strong>
          <p>
            Photos, files, GitHub work, websites, and physical delivery quality
            remain subject to buyer or arbitrator review.
          </p>
        </GlassCard>
        <GlassCard className="preview-card">
          <strong>Replay protection</strong>
          <p>
            Verified source evidence is bound to one escrow and cannot be reused
            for another agreement.
          </p>
        </GlassCard>
        <GlassCard className="preview-card">
          <strong>Manual withdrawal</strong>
          <p>
            Seller withdrawal is a separate escrow action and requires an actual
            positive contract balance.
          </p>
        </GlassCard>
      </div>
    </div>
  );
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
  return (
    <section className="preview-section">
      <header>
        <div>
          <span className="eyebrow">ARBITRATOR SERVICES</span>
          <h2>Arbitrator marketplace preview</h2>
        </div>
        <StatusBadge>In development</StatusBadge>
      </header>
      <p>
        Arbitrator registration, profiles, availability, assignments, and fee
        policy are planned. Fee collection and marketplace logic are not active
        yet.
      </p>
      <div className="preview-card-grid">
        {cards.map((card) => (
          <GlassCard key={card} className="preview-card">
            <strong>{card}</strong>
            <StatusBadge>Coming next</StatusBadge>
          </GlassCard>
        ))}
      </div>
    </section>
  );
}
