"use client";

import React from "react";
import { GlassButton, GlassCard, StatusBadge } from "../ui/glass";

export interface WalletConnectorOption { id: string; name: string; type: string; }

export function WalletOnboarding({ connectors, connect, walletConnectConfigured, busyConnector, error }: {
  connectors: WalletConnectorOption[];
  connect: (connectorId: string) => Promise<void>;
  walletConnectConfigured: boolean;
  busyConnector?: string;
  error?: string;
}) {
  const injected = connectors.filter((connector) => connector.type !== "walletConnect");
  const remote = connectors.find((connector) => connector.type === "walletConnect");
  return <main className="onboarding"><div className="ambient-grid" /><div className="onboarding-inner">
    <div className="welcome-copy"><span className="onboarding-mark">V</span><p className="eyebrow">SELF-CUSTODIAL TRUST</p><h1>VEYRONIS</h1><p>Trust between strangers, backed by verifiable evidence.</p></div>
    <GlassCard className="welcome-actions connect-actions"><div className="connect-heading"><div><h2>Connect wallet</h2><p>Choose the wallet that will sign your Veyronis actions.</p></div><StatusBadge tone="green">Non-custodial</StatusBadge></div>
      {injected.map((connector) => <GlassButton className="primary-button connector-button" disabled={Boolean(busyConnector)} key={connector.id} onClick={() => void connect(connector.id)}><span className="connector-icon">E</span><span>{busyConnector === connector.id ? "Connecting..." : connector.name}</span></GlassButton>)}
      {injected.length === 0 && <p className="connector-note">No browser extension wallet was detected.</p>}
      <div className="connector-divider"><span>or</span></div>
      <GlassButton className="connector-button" disabled={!remote || Boolean(busyConnector)} onClick={() => remote && void connect(remote.id)}><span className="connector-icon">W</span><span>{busyConnector === remote?.id ? "Opening wallet..." : "WalletConnect"}</span></GlassButton>
      {!walletConnectConfigured && <p className="connector-note">WalletConnect requires a configured Reown project ID.</p>}
      {error && <p className="form-error" role="alert">{error}</p>}<small>Veyronis never receives your private keys or recovery phrase.</small>
    </GlassCard>
  </div><footer>Self-custodial | Connected wallet | Verifiable evidence</footer></main>;
}
