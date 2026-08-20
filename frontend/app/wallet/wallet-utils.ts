import { Mnemonic, Wallet } from "ethers";
export function walletFromPhrase(phrase: string) {
  const normalized = phrase.trim().toLowerCase().replace(/\s+/g, " ");
  if (!Mnemonic.isValidMnemonic(normalized)) throw new Error("Invalid recovery phrase");
  return Wallet.fromPhrase(normalized);
}
