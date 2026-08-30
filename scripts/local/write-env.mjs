import { readFile, writeFile } from "node:fs/promises";
import { localAccounts, LOCAL_CHAIN_ID, LOCAL_RPC_URL } from "./local-accounts.mjs";

const deployment = JSON.parse(await readFile("local/contracts.json", "utf8"));
const accounts = Object.fromEntries(localAccounts().map((account) => [account.role, account]));

const backendValues = {
  APP_ENV: "local",
  DEPLOYER_RPC_URL: LOCAL_RPC_URL,
  DEPLOYER_PRIVATE_KEY: accounts.deployer.privateKey,
  VEYRONIS_VERIFIER_PRIVATE_KEY: accounts.verifier.privateKey,
  VEYRONIS_EVIDENCE_REGISTRY_ADDRESS: deployment.evidenceRegistry,
  DATABASE_URL: "postgres://postgres@127.0.0.1:55432/veyronis",
  BACKEND_HOST: "127.0.0.1",
  BACKEND_PORT: "3001",
  FRONTEND_ORIGIN: "http://127.0.0.1:3000",
  SESSION_SECRET: "local-development-session-secret-only",
};

const frontendValues = {
  NEXT_PUBLIC_BACKEND_URL: "http://127.0.0.1:3001",
  NEXT_PUBLIC_CHAIN_ID: String(LOCAL_CHAIN_ID),
  NEXT_PUBLIC_LOCAL_DEVELOPMENT: "true",
  NEXT_PUBLIC_NETWORK_NAME: "Anvil Local",
  NEXT_PUBLIC_AA_NETWORK: "anvil",
  NEXT_PUBLIC_ANVIL_RPC_URL: LOCAL_RPC_URL,
};

function toEnvFile(values) {
  return `${Object.entries(values).map(([key, value]) => `${key}=${value}`).join("\n")}\n`;
}

await writeFile("backend/.env.local", toEnvFile(backendValues), "utf8");
await writeFile("frontend/.env.local", toEnvFile(frontendValues), "utf8");

console.log("Wrote ignored backend/.env.local and frontend/.env.local with deterministic Anvil-only development accounts.");
console.log("Note: NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID is not set here, add your own in frontend/.env.local if you need WalletConnect locally.");
