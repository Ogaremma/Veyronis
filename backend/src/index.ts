export { AttestcoinService } from "./attestcoin/attestcoin-service.js";
export {
  AttestcoinVerifier,
  computeClaimId,
  computeEvidenceCommitment,
  computeEvidencePolicyCommitment,
  computeSourceEvidenceKey,
} from "./attestcoin/attestcoin-verifier.js";
export {
  EthersEscrowContextReader,
  EthersEvidenceClaimRegistryGateway,
} from "./attestcoin/ethers-gateways.js";
export { SourceTransactionPolicyEvaluator } from "./attestcoin/source-transaction-interpreter.js";
export {
  createLiveAttestcoinVerifier,
  SOURCE_PAYMENT_EVIDENCE_TYPE,
} from "./attestcoin/live-verifier.js";
export { ConfigurationError, loadConfig } from "./config.js";
export type {
  CryptographicProofVerifier,
  EscrowContextReader,
  EvidenceClaimRegistryGateway,
  ProofVerificationResult,
  EvidencePolicyEvaluator,
  VerifiedSourceTransaction,
} from "./attestcoin/verifier-types.js";
export type {
  ClaimSubmissionResult,
  EvidenceClaimOrchestrator,
  VerifiedProofMetadata,
} from "./attestcoin/evidence-claim-orchestrator.js";
