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
  const walletConnect = connectors.find((connector) => connector.id === "walletConnect");
  const injected = connectors.find((connector) => connector.id === "injected");
  const named = connectors.filter(
    (connector) => connector !== walletConnect && connector !== injected,
  );
  return <main className="onboarding"><div className="ambient-grid" /><div className="onboarding-inner">
    <div className="welcome-copy"><span className="onboarding-mark">V</span><p className="eyebrow">SELF-CUSTODIAL TRUST</p><h1>VEYRONIS</h1><p>Trust between strangers, backed by verifiable evidence.</p></div>
    <GlassCard className="welcome-actions connect-actions"><div className="connect-heading"><div><h2>Connect wallet</h2><p>Choose the wallet that will sign your Veyronis actions.</p></div><StatusBadge tone="green">Non-custodial</StatusBadge></div>
      {named.map((connector) => <GlassButton className="primary-button connector-button" disabled={Boolean(busyConnector)} key={connector.id} onClick={() => void connect(connector.id)}><span className="connector-icon">E</span><span>{busyConnector === connector.id ? "Connecting..." : connector.name}</span></GlassButton>)}
      {named.length === 0 && <p className="connector-note">No browser extension wallet was detected.</p>}
      <div className="connector-divider"><span>or</span></div>
      <GlassButton className="connector-button" disabled={!walletConnect || Boolean(busyConnector)} onClick={() => walletConnect && void connect(walletConnect.id)}><span className="connector-icon">W</span><span>{busyConnector === walletConnect?.id ? "Opening wallet..." : "WalletConnect"}</span></GlassButton>
      {!walletConnectConfigured && <p className="connector-note">WalletConnect requires a configured Reown project ID.</p>}
      {injected && <GlassButton className="connector-button" disabled={Boolean(busyConnector)} onClick={() => void connect(injected.id)}><span className="connector-icon">E</span><span>{busyConnector === injected.id ? "Connecting..." : "Injected"}</span></GlassButton>}
      {error && <p className="form-error" role="alert">{error}</p>}<small>Veyronis never receives your private keys or recovery phrase.</small>
    </GlassCard>
  </div><footer>Self-custodial | Connected wallet | Verifiable evidence</footer></main>;
}
