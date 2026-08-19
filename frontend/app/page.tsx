"use client";

import { useEffect, useMemo, useState } from "react";
import {
  HDNodeWallet,
  JsonRpcProvider,
  Mnemonic,
  Wallet,
  formatEther,
  isAddress,
  parseEther,
} from "ethers";
import { AppShell, type AppSection } from "./ui/app-shell";
import { WalletOnboarding } from "./wallet/wallet-onboarding";
import { DashboardHome } from "./wallet/dashboard-home";
import { EscrowModule } from "./escrow/escrow-module";
import { PlaceholderModule } from "./ui/placeholder-module";

const RPC = process.env.NEXT_PUBLIC_LOCAL_RPC_URL ?? "http://127.0.0.1:8545";
const API = process.env.NEXT_PUBLIC_BACKEND_URL ?? "http://127.0.0.1:3001";

export default function Home() {
  const [wallet, setWallet] = useState<HDNodeWallet | null>(null);
  const [section, setSection] = useState<AppSection>("wallet");
  const [balance, setBalance] = useState("0");
  const [sendOpen, setSendOpen] = useState(false);
  const provider = useMemo(() => new JsonRpcProvider(RPC), []);

  useEffect(() => {
    if (!wallet) return;
    let active = true;
    const load = async () => {
      const value = await provider.getBalance(wallet.address);
      if (active) setBalance(formatEther(value));
    };
    void load();
    const timer = window.setInterval(() => void load(), 8000);
    return () => { active = false; window.clearInterval(timer); };
  }, [provider, wallet]);

  async function authenticate(nextWallet: HDNodeWallet) {
    const challenge = await fetch(`${API}/auth/challenge`, {
      method: "POST", credentials: "include", headers: { "content-type": "application/json" },
      body: JSON.stringify({ address: nextWallet.address }),
    });
    if (challenge.ok) {
      const { message } = await challenge.json() as { message: string };
      const signature = await nextWallet.signMessage(message);
      await fetch(`${API}/auth/verify`, {
        method: "POST", credentials: "include", headers: { "content-type": "application/json" },
        body: JSON.stringify({ address: nextWallet.address, signature }),
      });
    }
    setWallet(nextWallet);
  }

  function lock() {
    setWallet(null);
    setBalance("0");
    setSection("wallet");
  }

  async function sendEth(recipient: string, amount: string) {
    if (!wallet || !isAddress(recipient)) throw new Error("Enter a valid recipient address");
    const signer = wallet.connect(provider);
    const transaction = await signer.sendTransaction({ to: recipient, value: parseEther(amount) });
    await transaction.wait();
    setBalance(formatEther(await provider.getBalance(wallet.address)));
    return transaction.hash;
  }

  if (!wallet) return <WalletOnboarding onUnlock={authenticate} />;

  return (
    <AppShell address={wallet.address} section={section} setSection={setSection} lock={lock}>
      {section === "wallet" && <DashboardHome address={wallet.address} balance={balance} sendOpen={sendOpen} setSendOpen={setSendOpen} sendEth={sendEth} />}
      {section === "escrow" && <EscrowModule walletAddress={wallet.address} />}
      {section === "marketplace" && <PlaceholderModule kind="marketplace" />}
      {section === "proofs" && <PlaceholderModule kind="proofs" />}
      {section === "reputation" && <PlaceholderModule kind="reputation" />}
      {section === "activity" && <PlaceholderModule kind="activity" />}
    </AppShell>
  );
}

export function walletFromPhrase(phrase: string) {
  const normalized = phrase.trim().toLowerCase().replace(/\s+/g, " ");
  if (!Mnemonic.isValidMnemonic(normalized)) throw new Error("Invalid recovery phrase");
  return Wallet.fromPhrase(normalized);
}
