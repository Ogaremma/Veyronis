import { blockProver, chainInfo, proofProvider } from "@gluwa/usc-sdk";
import { JsonRpcProvider } from "ethers";
import type { AttestcoinProofRequest, VerificationFailureCode } from "@veyronis/shared";
import type { AppConfig } from "../config.js";
import type {
  CryptographicProofVerifier,
  ProofVerificationResult,
} from "./verifier-types.js";
import { decodeAttestedTransaction } from "./attested-transaction-decoder.js";

export class AttestcoinService implements CryptographicProofVerifier {
  readonly creditcoinProvider: JsonRpcProvider;
  readonly chainInfo: chainInfo.PrecompileChainInfoProvider;
  readonly proofBuilder: proofProvider.service.ProofBuilder;
  readonly blockProver: blockProver.PrecompileBlockProver;

  constructor(readonly config: AppConfig) {
    this.creditcoinProvider = new JsonRpcProvider(config.CREDITCOIN_RPC_URL);
    // The SDK's generated declaration uses a private ethers provider identity.
    // At runtime this is the same deduplicated ethers v6 JsonRpcProvider instance.
    const sdkProvider = this.creditcoinProvider as unknown as ConstructorParameters<
      typeof chainInfo.PrecompileChainInfoProvider
    >[0];
    this.chainInfo = new chainInfo.PrecompileChainInfoProvider(sdkProvider);
    this.proofBuilder = new proofProvider.service.ProofBuilder(
      config.SEPOLIA_CHAIN_KEY,
      config.ATTESTCOIN_PROOF_BUILDER_URL,
    );
    this.blockProver = new blockProver.PrecompileBlockProver(sdkProvider);
  }

  async verify(reference: AttestcoinProofRequest): Promise<ProofVerificationResult> {
    if (reference.sourceChainKey !== this.config.SEPOLIA_CHAIN_KEY) {
      return failure("UNSUPPORTED_SOURCE_CHAIN", "The requested source chain is not configured");
    }

    try {
      const supported = await this.chainInfo.getSupportedChainByKey(reference.sourceChainKey);
      if (!supported) {
        return failure("UNSUPPORTED_SOURCE_CHAIN", "Creditcoin does not support the source chain key");
      }

      const result = await this.proofBuilder.getProof(reference.transactionHash);
      if (!result.success || !result.data) {
        return failure("INVALID_PROOF", "The proof builder did not produce a proof");
      }

      const proof = result.data;
      if (proof.chainKey !== reference.sourceChainKey) {
        return failure("UNSUPPORTED_SOURCE_CHAIN", "The proof was generated for another source chain");
      }
      if (proof.txHash.toLowerCase() !== reference.transactionHash.toLowerCase()) {
        return failure("TRANSACTION_HASH_MISMATCH", "The proof metadata contains another transaction hash");
      }

      const transactionIndex = await this.blockProver.computeTransactionIndex(proof.merkleProof);
      if (transactionIndex !== proof.txIndex) {
        return failure("INVALID_PROOF", "The Merkle proof transaction index does not match the proof metadata");
      }

      const verified = await this.blockProver.verifySingle(
        proof.chainKey,
        proof.headerNumber,
        proof.txBytes,
        proof.merkleProof,
        proof.continuityProof,
      );
      if (!verified) {
        return failure("PROOF_VERIFICATION_FAILURE", "Creditcoin rejected the transaction inclusion proof");
      }

      let transaction;
      try {
        transaction = decodeAttestedTransaction(proof.txBytes);
      } catch {
        return failure("MISSING_TRANSACTION_CONTEXT", "The verified transaction context is malformed");
      }
      if (transaction.hash.toLowerCase() !== reference.transactionHash.toLowerCase()) {
        return failure("TRANSACTION_HASH_MISMATCH", "The verified transaction bytes hash to another transaction");
      }

      return {
        ok: true,
        transaction: {
          sourceChainKey: proof.chainKey,
          sourceTransactionHash: transaction.hash,
          sourceBlockNumber: proof.headerNumber,
          transactionIndex,
          from: transaction.from,
          to: transaction.to,
          chainId: transaction.chainId,
          value: transaction.value,
          data: transaction.data,
          receiptStatus: transaction.receiptStatus,
          logs: transaction.logs,
        },
      };
    } catch {
      return failure("PROVIDER_FAILURE", "Attestcoin or Creditcoin provider call failed");
    }
  }
}

function failure(
  code: VerificationFailureCode,
  message: string,
): ProofVerificationResult {
  return { ok: false, code, message };
}
