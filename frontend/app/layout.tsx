import type { ReactNode } from "react";
import { metadata as siteMetadata } from "./metadata";
import "./globals.css";
import "./premium.css";
import "./connect-wallet.css";
import "./escrow/work-evidence.css";
import { Web3Provider } from "./web3-provider";

export default function RootLayout({
  children,
}: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="en">
      <body>
        <Web3Provider>{children}</Web3Provider>
      </body>
    </html>
  );
}

export const metadata = siteMetadata;
