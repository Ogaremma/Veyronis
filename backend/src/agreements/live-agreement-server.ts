import { readFile } from "node:fs/promises";
import { createServer } from "node:http";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { JsonRpcProvider, Wallet, type InterfaceAbi } from "ethers";
import { Pool } from "pg";
import { loadAgreementServerConfig } from "../config.js";
import { AgreementCreationService } from "./agreement-service.js";
import { createAgreementHttpHandler } from "./agreement-http.js";
import { SqlAgreementRepository } from "./agreement-repository.js";
import { EthersEscrowDeployer } from "./escrow-deployer.js";

const config = loadAgreementServerConfig();
const artifactPath = resolve(
  fileURLToPath(new URL(".", import.meta.url)),
  "../../../contracts/out/VeyronisEscrow.sol/VeyronisEscrow.json",
);
const artifact = JSON.parse(await readFile(artifactPath, "utf8")) as {
  abi: unknown[];
  bytecode: { object: string };
};
const provider = new JsonRpcProvider(config.DEPLOYER_RPC_URL);
const deployer = new EthersEscrowDeployer(
  new Wallet(config.DEPLOYER_PRIVATE_KEY, provider),
  artifact.abi as InterfaceAbi,
  artifact.bytecode.object,
);
const database = new Pool({ connectionString: config.DATABASE_URL });
const service = new AgreementCreationService(
  new SqlAgreementRepository(database),
  deployer,
);
const server = createServer(createAgreementHttpHandler(service));
server.listen(config.BACKEND_PORT, config.BACKEND_HOST, () => {
  console.log(
    `Veyronis agreement backend listening on http://${config.BACKEND_HOST}:${config.BACKEND_PORT}`,
  );
});
