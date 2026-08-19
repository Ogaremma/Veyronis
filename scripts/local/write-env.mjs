import { readFile, writeFile } from "node:fs/promises";
import { localAccounts, LOCAL_CHAIN_ID, LOCAL_RPC_URL } from "./local-accounts.mjs";

const deployment = JSON.parse(await readFile("local/contracts.json", "utf8"));
const accounts = Object.fromEntries(localAccounts().map((account) => [account.role, account]));
const values = {
  APP_ENV: "local",
  LOCAL_RPC_URL,
  LOCAL_CHAIN_ID: String(LOCAL_CHAIN_ID),
  LOCAL_DEPLOYER_PRIVATE_KEY: accounts.deployer.privateKey,
  LOCAL_VERIFIER_PRIVATE_KEY: accounts.verifier.privateKey,
  DEPLOYER_RPC_URL: LOCAL_RPC_URL,
  DEPLOYER_PRIVATE_KEY: accounts.deployer.privateKey,
  VEYRONIS_EVIDENCE_REGISTRY_ADDRESS: deployment.evidenceRegistry,
  DATABASE_URL: "postgres://postgres@127.0.0.1:55432/veyronis",
  BACKEND_HOST: "127.0.0.1",
  BACKEND_PORT: "3001",
  FRONTEND_ORIGIN: "http://127.0.0.1:3000",
  SESSION_SECRET: "local-development-session-secret-only",
  NEXT_PUBLIC_BACKEND_URL: "http://127.0.0.1:3001",
  NEXT_PUBLIC_CHAIN_ID: String(LOCAL_CHAIN_ID),
  NEXT_PUBLIC_LOCAL_DEVELOPMENT: "true",
  NEXT_PUBLIC_NETWORK_NAME: "Anvil Local",
};
await writeFile(".env.local", `${Object.entries(values).map(([key, value]) => `${key}=${value}`).join("\n")}\n`, "utf8");
console.log("Wrote ignored .env.local with deterministic Anvil-only development accounts.");
