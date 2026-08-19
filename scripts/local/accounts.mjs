import { LOCAL_CHAIN_ID, LOCAL_RPC_URL, localAccounts } from "./local-accounts.mjs";

console.log(JSON.stringify({ chainId: LOCAL_CHAIN_ID, rpcUrl: LOCAL_RPC_URL, accounts: localAccounts() }, null, 2));
