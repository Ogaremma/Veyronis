"use client";
import { useEffect, useState } from "react";
import { BrowserProvider } from "ethers";
import Link from "next/link";
type Item = {
  metadata: {
    id: string;
    escrowAddress?: string;
    deploymentStatus: string;
    requiredAmount: string;
  };
  role: string;
  chain?: { state: string };
};
const API = process.env.NEXT_PUBLIC_BACKEND_URL ?? "http://127.0.0.1:3001";
declare global {
  interface Window {
    ethereum?: unknown;
  }
}
export default function Dashboard() {
  const [address, setAddress] = useState("");
  const [items, setItems] = useState<Item[]>([]);
  const [error, setError] = useState("");
  async function load() {
    const response = await fetch(`${API}/agreements`, {
      credentials: "include",
    });
    if (!response.ok) throw new Error("Sign in to view agreements");
    setItems(await response.json());
  }
  async function connect() {
    try {
      if (!window.ethereum) throw new Error("A wallet extension is required");
      const signer = await new BrowserProvider(
        window.ethereum as never,
      ).getSigner();
      const wallet = await signer.getAddress();
      const challenge = await fetch(`${API}/auth/challenge`, {
        method: "POST",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ address: wallet }),
      }).then((r) => r.json());
      const signature = await signer.signMessage(challenge.message);
      const verified = await fetch(`${API}/auth/verify`, {
        method: "POST",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ address: wallet, signature }),
      });
      if (!verified.ok) throw new Error("Wallet signature was rejected");
      setAddress(wallet);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Wallet login failed");
    }
  }
  useEffect(() => {
    void load().catch(() => undefined);
  }, []);
  return (
    <main className="dashboard-shell">
      <header className="dashboard-top">
        <div>
          <span className="dash-eyebrow">VEYRONIS / CONTROL ROOM</span>
          {process.env.NEXT_PUBLIC_LOCAL_DEVELOPMENT === "true" && (
            <span className="local-indicator">
              LOCAL DEVELOPMENT / {process.env.NEXT_PUBLIC_NETWORK_NAME ?? "Anvil"}
            </span>
          )}
          <h1>Agreement dashboard</h1>
        </div>
        <button className="dash-primary" onClick={() => void connect()}>
          {address
            ? `${address.slice(0, 6)}...${address.slice(-4)}`
            : "Sign in with wallet"}
        </button>
      </header>
      <section className="dashboard-intro">
        <div>
          <p className="dash-eyebrow">ON-CHAIN AGREEMENTS</p>
          <h2>Your agreements, grounded in contract state.</h2>
          <p className="dash-muted">
            Metadata helps you find agreements. Creditcoin remains authoritative
            for custody, state, evidence acceptance, and settlement.
          </p>
        </div>
        <div className="trust-note">
          <strong>Evidence is advisory</strong>
          <span>
            Verified evidence informs dispute review; it never settles funds by
            itself.
          </span>
        </div>
      </section>
      {error && <p className="dash-error">{error}</p>}
      <section className="agreement-list">
        {items.length === 0 ? (
          <div className="dash-panel">
            <h3>No agreements loaded</h3>
            <p className="dash-muted">
              Connect the participant wallet to load agreements.
            </p>
          </div>
        ) : (
          items.map((item) => (
            <Link
              className="agreement-row"
              href={`/dashboard/${item.metadata.id}`}
              key={item.metadata.id}
            >
              <div>
                <span className="dash-status">
                  {item.chain?.state ?? item.metadata.deploymentStatus}
                </span>
                <h3>
                  {item.metadata.escrowAddress
                    ? `${item.metadata.escrowAddress.slice(0, 10)}...`
                    : "Awaiting deployment"}
                </h3>
                <p className="dash-muted">
                Role: {item.role} / {item.metadata.requiredAmount} base units
                </p>
              </div>
            <span className="dash-arrow">-&gt;</span>
            </Link>
          ))
        )}
      </section>
    </main>
  );
}
