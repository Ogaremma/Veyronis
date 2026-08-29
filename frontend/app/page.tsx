"use client";

import React, { useEffect, useState } from "react";
import { BrowserProvider, formatEther, isAddress, parseEther } from "ethers";
import { useAccount, useConnect, useConnectors, useDisconnect } from "wagmi";
import { AppShell, type AppSection } from "./ui/app-shell";
import { WalletOnboarding } from "./wallet/wallet-onboarding";
import { DashboardHome } from "./wallet/dashboard-home";
import { EscrowModule } from "./escrow/escrow-module";
import { PlaceholderModule } from "./ui/placeholder-module";
import { walletConnectConfigured } from "./web3-config";

const API = process.env.NEXT_PUBLIC_BACKEND_URL ?? "http://127.0.0.1:3001";

export default function Home() {
  const { address, connector, isConnected } = useAccount();
  const connectors = useConnectors();
  const { connectAsync } = useConnect();
  const { disconnect } = useDisconnect();
  const [authenticatedAddress, setAuthenticatedAddress] = useState("");
  const [section, setSection] = useState<AppSection>("wallet");
  const [balance, setBalance] = useState("0");
  const [sendOpen, setSendOpen] = useState(false);
  const [busyConnector, setBusyConnector] = useState("");
  const [connectionError, setConnectionError] = useState("");

  useEffect(() => {
    if (!isConnected || !address || !connector || authenticatedAddress !== address) return;
    let active = true;
    const load = async () => { const provider = await browserProvider(connector); const value = await provider.getBalance(address); if (active) setBalance(formatEther(value)); };
    void load().catch(() => active && setBalance("0"));
    const timer = window.setInterval(() => void load(), 8000);
    return () => { active = false; window.clearInterval(timer); };
  }, [address, authenticatedAddress, connector, isConnected]);

  async function connectWallet(connectorId: string) {
    const nextConnector = connectors.find((candidate) => candidate.id === connectorId);
    if (!nextConnector) return;
    setBusyConnector(connectorId); setConnectionError("");
    try {
      const result = await connectAsync({ connector: nextConnector });
      const nextAddress = result.accounts[0];
      if (!nextAddress) throw new Error("The wallet did not return an account");
      const provider = await browserProvider(nextConnector);
      const signer = await provider.getSigner(nextAddress);
      await authenticate(nextAddress, (message) => signer.signMessage(message));
      setAuthenticatedAddress(nextAddress);
    } catch (reason) {
      disconnect();
      setConnectionError(reason instanceof Error ? reason.message : "Wallet connection failed");
    } finally { setBusyConnector(""); }
  }

  async function authenticate(nextAddress: string, signMessage: (message: string) => Promise<string>) {
    const challenge = await fetch(`${API}/auth/challenge`, { method: "POST", credentials: "include", headers: { "content-type": "application/json" }, body: JSON.stringify({ address: nextAddress }) });
    if (!challenge.ok) throw new Error("Unable to request wallet authentication");
    const { message } = await challenge.json() as { message: string };
    const signature = await signMessage(message);
    const verification = await fetch(`${API}/auth/verify`, { method: "POST", credentials: "include", headers: { "content-type": "application/json" }, body: JSON.stringify({ address: nextAddress, signature }) });
    if (!verification.ok) throw new Error("Wallet signature was rejected");
  }

  function lock() {
    disconnect(); setAuthenticatedAddress(""); setBalance("0"); setSection("wallet");
    void fetch(`${API}/auth/logout`, { method: "POST", credentials: "include" });
  }

  async function sendEth(recipient: string, amount: string) {
    if (!connector || !address || !isAddress(recipient)) throw new Error("Enter a valid recipient address");
    const provider = await browserProvider(connector);
    const signer = await provider.getSigner(address);
    const transaction = await signer.sendTransaction({ to: recipient, value: parseEther(amount) });
    await transaction.wait();
    setBalance(formatEther(await provider.getBalance(address)));
    return transaction.hash;
  }

  if (!isConnected || !address || authenticatedAddress.toLowerCase() !== address.toLowerCase()) return <WalletOnboarding connectors={connectors.map(({ id, name, type }) => ({ id, name, type }))} connect={connectWallet} walletConnectConfigured={walletConnectConfigured} busyConnector={busyConnector} error={connectionError} />;
  return <AppShell address={address} section={section} setSection={setSection} lock={lock}>
    {section === "wallet" && <DashboardHome address={address} balance={balance} sendOpen={sendOpen} setSendOpen={setSendOpen} sendEth={sendEth} />}
    {section === "escrow" && <EscrowModule walletAddress={address} />}
    {section === "marketplace" && <PlaceholderModule kind="marketplace" />}{section === "proofs" && <PlaceholderModule kind="proofs" />}{section === "reputation" && <PlaceholderModule kind="reputation" />}{section === "activity" && <PlaceholderModule kind="activity" />}
  </AppShell>;
}

async function browserProvider(connector: { getProvider(): Promise<unknown> }) { return new BrowserProvider(await connector.getProvider() as never); }
