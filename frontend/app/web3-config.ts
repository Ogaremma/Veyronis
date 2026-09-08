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
  url: "https://veyronis.local",
  icons: [],
};

type RainbowWallet = ReturnType<typeof metaMaskWallet>;
type RainbowWalletFactory = (params: {
  projectId: string;
  appName: string;
  appDescription?: string;
  appUrl?: string;
  appIcon?: string;
  options?: { metadata: typeof appMetadata };
  walletConnectParameters?: { metadata: typeof appMetadata };
}) => RainbowWallet;

const walletParams = {
  projectId: walletConnectProjectId ?? "",
  appName: appMetadata.name,
  appDescription: appMetadata.description,
  appUrl: appMetadata.url,
  options: { metadata: appMetadata },
  walletConnectParameters: { metadata: appMetadata },
};

const recommendedWalletFactories = [
  metaMaskWallet,
  coinbaseWallet,
  rainbowWallet,
  phantomWallet,
  rabbyWallet,
  okxWallet,
  trustWallet,
] as RainbowWalletFactory[];

const namedWalletConnectors = recommendedWalletFactories.map((createWallet, index) => {
  const wallet = createWallet(walletParams);
  return wallet.createConnector({
    rkDetails: {
      ...wallet,
      index,
      groupIndex: 1,
      groupName: "Recommended",
      isRainbowKitConnector: true,
    },
  });
});

const walletConnectWalletInstance = walletConnectWallet(walletParams);
const walletConnectConnector = walletConnectWalletInstance.createConnector({
  rkDetails: {
    ...walletConnectWalletInstance,
    index: recommendedWalletFactories.length,
    groupIndex: 2,
    groupName: "Other",
    isRainbowKitConnector: true,
    isWalletConnectModalConnector: true,
    showQrModal: true,
  },
});

export const web3Config = createConfig({
  chains: [anvil, sepolia],
  connectors: [
    ...namedWalletConnectors,
    walletConnectConnector,
    injected(),
  ],
  multiInjectedProviderDiscovery: true,
  ssr: true,
  transports: {
    [anvil.id]: http(process.env.NEXT_PUBLIC_ANVIL_RPC_URL),
    [sepolia.id]: http(process.env.NEXT_PUBLIC_SEPOLIA_RPC_URL),
  },
});

export const walletConnectConfigured = Boolean(walletConnectProjectId);
