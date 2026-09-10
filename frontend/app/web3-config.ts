import { connectorsForWallets } from "@rainbow-me/rainbowkit";
import {
  coinbaseWallet,
  metaMaskWallet,
  okxWallet,
  phantomWallet,
  rabbyWallet,
  rainbowWallet,
  trustWallet,
  walletConnectWallet,
} from "@rainbow-me/rainbowkit/wallets";
import { createConfig, http, injected } from "wagmi";
import { anvil, sepolia } from "wagmi/chains";

const walletConnectProjectId = process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID;
const appMetadata = {
  name: "Veyronis",
  description: "Self-custodial agreements backed by verifiable evidence",
  url: "https://veyronis-proof.vercel.app/",
  icons: [],
};

const recommendedWallets = [
  metaMaskWallet, coinbaseWallet, rainbowWallet, phantomWallet,
  rabbyWallet, okxWallet, trustWallet,
];

const walletGroups = [{ groupName: "Recommended", wallets: recommendedWallets }];
if (walletConnectProjectId) {
  walletGroups.push({ groupName: "Other", wallets: [walletConnectWallet] });
}

const rainbowConnectors = connectorsForWallets(walletGroups, {
  projectId: walletConnectProjectId ?? "",
  appName: appMetadata.name,
  appDescription: appMetadata.description,
  appUrl: appMetadata.url,
  walletConnectParameters: { metadata: appMetadata },
});

export const web3Config = createConfig({
  chains: [anvil, sepolia],
  connectors: [...rainbowConnectors, injected()],
  multiInjectedProviderDiscovery: true,
  ssr: true,
  transports: {
    [anvil.id]: http(process.env.NEXT_PUBLIC_ANVIL_RPC_URL),
    [sepolia.id]: http(process.env.NEXT_PUBLIC_SEPOLIA_RPC_URL),
  },
});

export const walletConnectConfigured = Boolean(walletConnectProjectId);
