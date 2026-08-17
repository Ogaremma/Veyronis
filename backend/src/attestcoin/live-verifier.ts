import { Wallet, id } from "ethers";
import type { AppConfig } from "../config.js";
import { AttestcoinService } from "./attestcoin-service.js";
import { AttestcoinVerifier } from "./attestcoin-verifier.js";
import {
  EthersEscrowContextReader,
  EthersEvidenceClaimRegistryGateway,
} from "./ethers-gateways.js";
import { SourceTransactionSenderInterpreter } from "./source-transaction-interpreter.js";

export const SOURCE_PAYMENT_EVIDENCE_TYPE = id("SOURCE_PAYMENT");

export function createLiveAttestcoinVerifier(config: AppConfig): AttestcoinVerifier {
  const service = new AttestcoinService(config);
  const signer = new Wallet(config.VEYRONIS_VERIFIER_PRIVATE_KEY, service.creditcoinProvider);
  return new AttestcoinVerifier(
    service,
    new SourceTransactionSenderInterpreter(SOURCE_PAYMENT_EVIDENCE_TYPE),
    new EthersEscrowContextReader(service.creditcoinProvider),
    new EthersEvidenceClaimRegistryGateway(config.VEYRONIS_EVIDENCE_REGISTRY_ADDRESS, signer),
  );
}
