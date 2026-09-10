"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import React, { useState, type ReactNode } from "react";
import { WagmiProvider } from "wagmi";
import { RainbowKitProvider } from "@rainbow-me/rainbowkit";
import { web3Config } from "./web3-config";

export function Web3Provider({ children }: { children: ReactNode }) {
  const [queryClient] = useState(() => new QueryClient());
  return <WagmiProvider config={web3Config} reconnectOnMount={false}><QueryClientProvider client={queryClient}><RainbowKitProvider>{children}</RainbowKitProvider></QueryClientProvider></WagmiProvider>;
}
