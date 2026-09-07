import { JsonRpcProvider, Wallet, id } from "ethers";
import type { AppConfig } from "../config.js";
import { AttestcoinService } from "./attestcoin-service.js";
import { AttestcoinVerifier } from "./attestcoin-verifier.js";
import {
  EthersEscrowContextReader,
  EthersEvidenceClaimRegistryGateway,
} from "./ethers-gateways.js";
import { SourceTransactionPolicyEvaluator } from "./source-transaction-interpreter.js";

export const SOURCE_PAYMENT_EVIDENCE_TYPE = id("SOURCE_PAYMENT");

export async function createLiveAttestcoinVerifier(
  config: AppConfig,
  sepoliaProvider: JsonRpcProvider,
  creditcoinProvider = new JsonRpcProvider(config.CREDITCOIN_RPC_URL),
): Promise<AttestcoinVerifier> {
  const service = new AttestcoinService(config, creditcoinProvider);
  const [creditcoinNetwork, sepoliaNetwork] = await Promise.all([
    service.creditcoinProvider.getNetwork(),
    sepoliaProvider.getNetwork(),
  ]);
  if (creditcoinNetwork.chainId !== 102031n)
    throw new Error("Creditcoin RPC is connected to another chain");
  if (sepoliaNetwork.chainId !== 11155111n)
    throw new Error("Sepolia RPC is connected to another chain");

  const signer = new Wallet(config.VEYRONIS_VERIFIER_PRIVATE_KEY, sepoliaProvider);
  return new AttestcoinVerifier(
    service,
    new SourceTransactionPolicyEvaluator(),
    new EthersEscrowContextReader(sepoliaProvider),
    new EthersEvidenceClaimRegistryGateway(config.VEYRONIS_EVIDENCE_REGISTRY_ADDRESS, signer),
  );
}
