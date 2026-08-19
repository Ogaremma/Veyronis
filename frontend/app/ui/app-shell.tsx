import type { ReactNode } from "react";

export type AppSection = "wallet" | "escrow" | "marketplace" | "proofs" | "reputation" | "activity";
const nav: { id: AppSection; label: string; icon: string }[] = [
  { id: "wallet", label: "Wallet", icon: "◫" }, { id: "escrow", label: "Escrow", icon: "◇" },
  { id: "marketplace", label: "Marketplace", icon: "▦" }, { id: "proofs", label: "Proofs", icon: "✓" },
  { id: "reputation", label: "Reputation", icon: "◎" }, { id: "activity", label: "Activity", icon: "↗" },
];
export function AppShell({ address, section, setSection, lock, children }: { address: string; section: AppSection; setSection: (value: AppSection) => void; lock: () => void; children: ReactNode }) {
  const short = `${address.slice(0, 6)}...${address.slice(-4)}`;
  return <div className="app-shell">
    <aside className="sidebar">
      <button className="brand" onClick={() => setSection("wallet")}><span className="brand-glyph">V</span><span>VEYRONIS</span></button>
      <nav>{nav.map(item => <button key={item.id} className={section === item.id ? "nav-active" : ""} onClick={() => setSection(item.id)}><span>{item.icon}</span>{item.label}</button>)}</nav>
      <div className="sidebar-foot"><div className="network-pill"><i />Anvil Local · 31337</div><button className="lock-button" onClick={lock}>Lock Wallet</button></div>
    </aside>
    <main className="app-main"><header className="mobile-top"><button className="brand"><span className="brand-glyph">V</span><span>VEYRONIS</span></button><span className="address-chip">{short}</span></header>{children}</main>
    <nav className="bottom-nav">{nav.slice(0, 5).map(item => <button key={item.id} className={section === item.id ? "nav-active" : ""} onClick={() => setSection(item.id)}><span>{item.icon}</span><small>{item.label}</small></button>)}</nav>
  </div>;
}
