import { getNetworkName } from "./network-label";

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
