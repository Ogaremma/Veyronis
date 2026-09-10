import { anvil, sepolia } from "wagmi/chains";

const networkNames: Record<number, string> = {
  [sepolia.id]: "Sepolia",
  [anvil.id]: "Anvil Local",
};

export function getNetworkName(chainId: number | undefined) {
  return chainId === undefined ? "Unsupported Network" : networkNames[chainId] ?? "Unsupported Network";
}

export function getNetworkLabel(chainId: number | undefined) {
  const networkName = getNetworkName(chainId);
  return chainId !== undefined && networkNames[chainId] ? `${networkName} \u00b7 ${chainId}` : networkName;
}
