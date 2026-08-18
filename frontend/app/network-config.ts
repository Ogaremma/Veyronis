export function explorerTransactionUrl(chainId: bigint, hash: string): string | undefined {
  const configured = process.env.NEXT_PUBLIC_EXPLORER_URL?.replace(/\/$/, "");
  if (!configured) return undefined;
  const configuredChain = process.env.NEXT_PUBLIC_CHAIN_ID;
  if (configuredChain && BigInt(configuredChain) !== chainId) return undefined;
  return `${configured}/tx/${hash}`;
}
