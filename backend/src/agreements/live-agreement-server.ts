import { readFile } from "node:fs/promises";
import { createServer } from "node:http";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { JsonRpcProvider, Wallet, type InterfaceAbi } from "ethers";
import { Pool } from "pg";
import { loadAgreementServerConfig, loadConfig } from "../config.js";
import { AgreementCreationService } from "./agreement-service.js";
import { createAgreementHttpHandler } from "./agreement-http.js";
import { SqlAgreementRepository } from "./agreement-repository.js";
import { EthersEscrowDeployer } from "./escrow-deployer.js";
import { WalletAuthService } from "../auth/wallet-auth.js";
import { EthersAgreementContractReader } from "./contract-read-layer.js";
import { AgreementDashboardService } from "./dashboard-service.js";
import { createLiveAttestcoinVerifier } from "../attestcoin/live-verifier.js";

const config = loadAgreementServerConfig();
const artifactPath = resolve(
  fileURLToPath(new URL(".", import.meta.url)),
  "../contracts/VeyronisEscrow.json",
);
const artifact = JSON.parse(await readFile(artifactPath, "utf8")) as {
  abi: unknown[];
  bytecode: { object: string };
};
const provider = new JsonRpcProvider(config.DEPLOYER_RPC_URL);
const sepoliaVerifierProvider = new JsonRpcProvider(config.DEPLOYER_RPC_URL);
const deployer = new EthersEscrowDeployer(
  new Wallet(config.DEPLOYER_PRIVATE_KEY, provider),
  artifact.abi as InterfaceAbi,
  artifact.bytecode.object,
);
const database = createDatabasePool(config.DATABASE_URL);
const service = new AgreementCreationService(
  new SqlAgreementRepository(database),
  deployer,
);
const auth = new WalletAuthService(config.SESSION_SECRET!);
const dashboard = new AgreementDashboardService(new SqlAgreementRepository(database), new EthersAgreementContractReader(provider));
const attestcoinVerifier = config.APP_ENV === "production"
  ? await createLiveAttestcoinVerifier(loadConfig(), sepoliaVerifierProvider)
  : await (async () => {
      try {
        return await createLiveAttestcoinVerifier(loadConfig(), sepoliaVerifierProvider);
      } catch {
        return undefined;
      }
    })();
const server = createServer(createAgreementHttpHandler(service, {
  auth,
  dashboard,
  appEnv: config.APP_ENV,
  ...(attestcoinVerifier ? { attestcoinVerifier } : {}),
}));
server.listen(config.BACKEND_PORT, config.BACKEND_HOST, () => {
  console.log(
    `Veyronis agreement backend listening on http://${config.BACKEND_HOST}:${config.BACKEND_PORT}`,
  );
});

function createDatabasePool(connectionString: string): Pool {
  const url = new URL(connectionString);
  const localHost = ["localhost", "127.0.0.1", "::1"].includes(url.hostname);
  const sslDisabled = url.searchParams.get("sslmode") === "disable";
  const ssl = localHost || sslDisabled ? undefined : { rejectUnauthorized: true };
  return new Pool({
    connectionString,
    max: 5,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 10_000,
    ...(ssl ? { ssl } : {}),
  });
}
