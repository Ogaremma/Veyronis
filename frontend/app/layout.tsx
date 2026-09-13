import type { ReactNode } from "react";
import type { Metadata } from "next";
import "./globals.css";
import "./connect-wallet.css";
import "./escrow/work-evidence.css";
import { Web3Provider } from "./web3-provider";

export default function RootLayout({
  children,
}: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="en">
      <body><Web3Provider>{children}</Web3Provider></body>
    </html>
  );
}

export const metadata: Metadata = {
  title: "Veyronis",
  description: "Verifiable escrow agreements with authoritative on-chain settlement.",
  icons: { icon: "/icon.svg" },
};
