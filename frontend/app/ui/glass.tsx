import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode } from "react";

export function GlassCard({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <section className={`glass-card ${className}`}>{children}</section>;
}
export function GlassButton({ children, className = "", ...props }: ButtonHTMLAttributes<HTMLButtonElement>) {
  return <button className={`glass-button ${className}`} {...props}>{children}</button>;
}
export function GlassInput(props: InputHTMLAttributes<HTMLInputElement>) {
  return <input className="glass-input" {...props} />;
}
export function StatusBadge({ children, tone = "blue" }: { children: ReactNode; tone?: "blue" | "green" | "amber" | "red" }) {
  return <span className={`status-badge status-${tone}`}>{children}</span>;
}
export function SectionHeader({ eyebrow, title, action }: { eyebrow: string; title: string; action?: ReactNode }) {
  return <header className="section-header"><div><span className="eyebrow">{eyebrow}</span><h1>{title}</h1></div>{action}</header>;
}
