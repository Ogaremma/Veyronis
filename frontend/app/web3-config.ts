import { http, createConfig } from "wagmi";
import { anvil, sepolia } from "wagmi/chains";
import { injected } from "wagmi/connectors/injected";
import { walletConnect } from "wagmi/connectors/walletConnect";

const walletConnectProjectId = process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID;

export const web3Config = createConfig({
  chains: [anvil, sepolia],
  connectors: [
    injected(),
    ...(walletConnectProjectId
      ? [walletConnect({
          projectId: walletConnectProjectId,
          showQrModal: true,
          metadata: {
            name: "Veyronis",
            description: "Self-custodial agreements backed by verifiable evidence",
            url: "https://veyronis.local",
            icons: [],
          },
        })]
      : []),
  ],
  multiInjectedProviderDiscovery: true,
  ssr: true,
  transports: {
    [anvil.id]: http(process.env.NEXT_PUBLIC_ANVIL_RPC_URL ?? "http://127.0.0.1:8545"),
    [sepolia.id]: http(process.env.NEXT_PUBLIC_SEPOLIA_RPC_URL),
  },
});

export const walletConnectConfigured = Boolean(walletConnectProjectId);
