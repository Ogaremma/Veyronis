import { getNetworkName } from "./network-label";
import { BrowserProvider } from "ethers";

export const PRODUCTION_TRANSACTION_CHAIN_ID = 11155111;
export const LOCAL_TRANSACTION_CHAIN_ID = 31337;

export function requiredTransactionChainId(
  configuredChainId: string | undefined = process.env.NEXT_PUBLIC_CHAIN_ID,
  localDevelopment: string | undefined = process.env.NEXT_PUBLIC_LOCAL_DEVELOPMENT,
): number {
  return localDevelopment === "true" && configuredChainId === String(LOCAL_TRANSACTION_CHAIN_ID)
    ? LOCAL_TRANSACTION_CHAIN_ID
    : PRODUCTION_TRANSACTION_CHAIN_ID;
}

export function transactionNetworkError(
  walletChainId: number | undefined,
  requiredChainId = requiredTransactionChainId(),
): string | undefined {
  if (walletChainId === requiredChainId) return undefined;
  return `Wrong network. Switch your wallet to ${getNetworkName(requiredChainId)} to continue.`;
}

export async function activeWalletChainId(
  connector: { getProvider(): Promise<unknown> } | undefined,
): Promise<{ provider: BrowserProvider; walletProvider: unknown; chainId: number }> {
  if (!connector) throw new Error("Wallet/provider unavailable. Connect the authenticated participant wallet first.");
  const walletProvider = await connector.getProvider();
  const provider = new BrowserProvider(walletProvider as never);
  const network = await provider.getNetwork();
  return { provider, walletProvider, chainId: Number(network.chainId) };
}
