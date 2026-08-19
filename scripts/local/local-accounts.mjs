import { HDNodeWallet } from "ethers";

export const LOCAL_MNEMONIC = "test test test test test test test test test test test junk";
export const LOCAL_CHAIN_ID = 31337;
export const LOCAL_RPC_URL = "http://127.0.0.1:8545";
export const roles = ["deployer", "buyer", "seller", "arbitrator", "verifier"];

export function localAccounts() {
  return roles.map((role, index) => {
    const wallet = HDNodeWallet.fromPhrase(
      LOCAL_MNEMONIC,
      undefined,
      `m/44'/60'/0'/0/${index}`,
    );
    return { role, address: wallet.address, privateKey: wallet.privateKey };
  });
}
