import type { ReactNode } from "react";
import "./globals.css";
import "./connect-wallet.css";
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
