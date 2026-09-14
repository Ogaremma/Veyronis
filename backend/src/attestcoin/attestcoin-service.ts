import { blockProver, chainInfo, proofProvider } from "@gluwa/usc-sdk";
import { JsonRpcProvider, type Provider } from "ethers";
import type {
  AttestcoinProofRequest,
  VerificationFailureCode,
} from "@veyronis/shared";
import type { AppConfig } from "../config.js";
import type {
  CryptographicProofVerifier,
  ProofVerificationResult,
} from "./verifier-types.js";
import { decodeAttestedTransaction } from "./attested-transaction-decoder.js";
import {
  SdkAttestcoinProofProvider,
  type AttestcoinProofProvider,
} from "./proof-provider.js";

interface AttestcoinDiagnosticLogger {
  info(message: string, details?: Record<string, unknown>): void;
}

export class AttestcoinService implements CryptographicProofVerifier {
  readonly creditcoinProvider: JsonRpcProvider;
  readonly chainInfo: chainInfo.PrecompileChainInfoProvider;
  readonly proofBuilder: AttestcoinProofProvider;
  readonly blockProver: blockProver.PrecompileBlockProver;
  readonly sourceProvider: Provider;

  constructor(
    readonly config: AppConfig,
    sourceProvider: Provider,
    creditcoinProvider: JsonRpcProvider = new JsonRpcProvider(
      config.CREDITCOIN_RPC_URL,
    ),
    private readonly logger: AttestcoinDiagnosticLogger = console,
  ) {
    this.sourceProvider = sourceProvider;
    this.creditcoinProvider = creditcoinProvider;
    // The SDK's generated declaration uses a private ethers provider identity.
    // At runtime this is the same deduplicated ethers v6 JsonRpcProvider instance.
    const sdkProvider = this
      .creditcoinProvider as unknown as ConstructorParameters<
      typeof chainInfo.PrecompileChainInfoProvider
    >[0];
    this.chainInfo = new chainInfo.PrecompileChainInfoProvider(sdkProvider);
    this.proofBuilder = new SdkAttestcoinProofProvider(
      new proofProvider.service.ProofBuilder(
        config.SEPOLIA_CHAIN_KEY,
        config.ATTESTCOIN_PROOF_BUILDER_URL,
      ),
    );
    this.blockProver = new blockProver.PrecompileBlockProver(sdkProvider);
  }

  async verify(
    reference: AttestcoinProofRequest,
  ): Promise<ProofVerificationResult> {
    this.log("verification.started", {
      transactionHash: reference.transactionHash,
      sourceChainKey: reference.sourceChainKey,
    });
    if (reference.sourceChainKey !== this.config.SEPOLIA_CHAIN_KEY) {
      return failure(
        "UNSUPPORTED_SOURCE_CHAIN",
        "The requested source chain is not configured",
      );
    }

    try {
      const sourceNetwork = await this.sourceProvider.getNetwork();
      const sourceTransaction = await this.sourceProvider.getTransaction(
        reference.transactionHash,
      );
      if (!sourceTransaction) {
        return failure(
          "SOURCE_TRANSACTION_NOT_FOUND",
          "The source transaction was not found on Sepolia",
        );
      }
      if (sourceTransaction.blockNumber == null) {
        return failure(
          "SOURCE_TRANSACTION_NOT_MINED",
          "The source transaction has not been mined",
        );
      }

      const sourceReceipt = await this.sourceProvider.getTransactionReceipt(
        reference.transactionHash,
      );
      if (!sourceReceipt || sourceReceipt.blockNumber == null) {
        return failure(
          "SOURCE_TRANSACTION_NOT_MINED",
          "The source transaction receipt is not available yet",
        );
      }
      const sourceBlockNumber = Number(sourceReceipt.blockNumber);
      if (sourceTransaction.blockNumber !== sourceReceipt.blockNumber) {
        return failure(
          "INVALID_PROOF",
          "The source transaction and receipt identify different blocks",
        );
      }
      const sourceBlock = await this.sourceProvider.getBlock(sourceBlockNumber);
      if (
        !sourceBlock ||
        sourceBlock.number == null ||
        Number(sourceBlock.number) !== sourceBlockNumber
      ) {
        return failure(
          "SOURCE_TRANSACTION_NOT_MINED",
          "The source block could not be read from Sepolia",
        );
      }
      this.log("source.transaction", {
        transactionHash: reference.transactionHash,
        sourceChainKey: reference.sourceChainKey,
        sourceChainId: sourceNetwork.chainId.toString(),
        sourceBlockNumber,
        receiptStatus: sourceReceipt.status,
      });
      if (sourceReceipt.status !== 1) {
        return failure(
          "POLICY_MISMATCH",
          "The source transaction receipt failed",
        );
      }

      const creditcoinNetwork = await this.creditcoinProvider.getNetwork();
      this.log("creditcoin.network", {
        chainId: creditcoinNetwork.chainId.toString(),
      });
      if (creditcoinNetwork.chainId !== 102031n) {
        return failure(
          "CONFIGURATION_MISSING",
          "The Creditcoin RPC is connected to another chain",
        );
      }

      const supportedChains = await this.chainInfo.getSupportedChains();
      const supported = supportedChains.find(
        (chain) => chain.chainKey === reference.sourceChainKey,
      );
      this.log("creditcoin.supported_chains", {
        supportedChains: supportedChains.map((chain) => ({
          chainKey: chain.chainKey,
          chainId: chain.chainId,
          chainName: chain.chainName,
        })),
      });
      if (!supported) {
        return failure(
          "UNSUPPORTED_SOURCE_CHAIN",
          "Creditcoin does not support the source chain key",
        );
      }
      if (BigInt(supported.chainId) !== sourceNetwork.chainId) {
        return failure(
          "UNSUPPORTED_SOURCE_CHAIN",
          "The live Creditcoin chain-key mapping does not match Sepolia",
        );
      }

      const latestAttested =
        await this.chainInfo.getLatestAttestedHeightAndHash(
          reference.sourceChainKey,
        );
      const initiallyAttested =
        latestAttested.exists && latestAttested.height >= sourceBlockNumber;
      this.log("creditcoin.attestation", {
        sourceChainKey: reference.sourceChainKey,
        sourceBlockNumber,
        latestAttestedHeight: latestAttested.exists
          ? latestAttested.height
          : null,
        sourceHeightAttested: initiallyAttested,
      });
      if (!initiallyAttested) {
        try {
          await this.chainInfo.waitUntilHeightAttested(
            reference.sourceChainKey,
            sourceBlockNumber,
            this.config.ATTESTATION_POLL_INTERVAL_MS,
            this.config.ATTESTATION_WAIT_TIMEOUT_MS,
            0,
          );
          const attested = await this.chainInfo.getLatestAttestedHeightAndHash(
            reference.sourceChainKey,
          );
          this.log("creditcoin.attestation_wait_complete", {
            sourceBlockNumber,
            latestAttestedHeight: attested.exists ? attested.height : null,
          });
          if (!attested.exists || attested.height < sourceBlockNumber) {
            return failure(
              "SOURCE_BLOCK_NOT_ATTESTED",
              "The source block is not attested on Creditcoin yet",
            );
          }
        } catch (error) {
          this.log("creditcoin.attestation_wait_failed", {
            sourceBlockNumber,
            error: errorMessage(error),
          });
          return failure(
            "SOURCE_BLOCK_NOT_ATTESTED",
            "The source block is not attested on Creditcoin yet",
          );
        }
      }

      if (this.proofBuilder.waitUntilHeightAttested) {
        try {
          await this.proofBuilder.waitUntilHeightAttested(
            reference.sourceChainKey,
            sourceBlockNumber,
            this.config.ATTESTATION_POLL_INTERVAL_MS,
            this.config.PROOF_BUILDER_WAIT_TIMEOUT_MS,
            0,
          );
        } catch (error) {
          this.log("proof_builder.wait_failed", {
            hostname: this.proofBuilderHostname,
            sourceBlockNumber,
            error: errorMessage(error),
          });
          return failure(
            "PROOF_BUILDER_UNAVAILABLE",
            "The Proof Builder has not made the attested source block available yet",
          );
        }
      }

      let result;
      try {
        result = await this.proofBuilder.getProof(reference.transactionHash);
      } catch (error) {
        this.log("proof_builder.request_failed", {
          hostname: this.proofBuilderHostname,
          error: errorMessage(error),
        });
        return failure(
          "PROOF_BUILDER_UNAVAILABLE",
          "The Proof Builder service could not be reached",
        );
      }
      const providerError = result.success ? undefined : result.error;
      const proofData = result.success ? result.data : undefined;
      const providerStatusCode = proofProviderStatusCode(providerError);
      this.log("proof_builder.response", {
        hostname: this.proofBuilderHostname,
        success: result.success,
        statusCode: providerStatusCode ?? null,
        error: providerError ?? null,
        headerNumber: proofData?.headerNumber ?? null,
        transactionIndex: proofData?.txIndex ?? null,
        cached: proofData?.cached ?? null,
      });
      if (!result.success || !proofData) {
        if (providerStatusCode === 404) {
          return failure(
            "PROOF_NOT_FOUND",
            "The Proof Builder has no proof for the source transaction",
          );
        }
        if (providerStatusCode !== undefined && providerStatusCode >= 500) {
          return failure(
            "PROOF_BUILDER_UNAVAILABLE",
            "The Proof Builder service is unavailable",
          );
        }
        return failure(
          "INVALID_PROOF",
          "The Proof Builder did not return a usable proof",
        );
      }

      const proof = proofData;
      if (proof.chainKey !== reference.sourceChainKey) {
        return failure(
          "UNSUPPORTED_SOURCE_CHAIN",
          "The proof was generated for another source chain",
        );
      }
      if (proof.headerNumber !== sourceBlockNumber) {
        return failure(
          "INVALID_PROOF",
          "The proof was generated for another source block",
        );
      }
      if (
        proof.txHash.toLowerCase() !== reference.transactionHash.toLowerCase()
      ) {
        return failure(
          "TRANSACTION_HASH_MISMATCH",
          "The proof metadata contains another transaction hash",
        );
      }

      let transactionIndex;
      try {
        transactionIndex = await this.blockProver.computeTransactionIndex(
          proof.merkleProof,
        );
      } catch (error) {
        this.log("block_prover.index_failed", { error: errorMessage(error) });
        return failure(
          "INVALID_PROOF",
          "The Merkle proof transaction index could not be computed",
        );
      }
      if (Number(transactionIndex) !== Number(proof.txIndex)) {
        return failure(
          "INVALID_PROOF",
          "The Merkle proof transaction index does not match the proof metadata",
        );
      }

      let verified = false;
      try {
        verified = await this.blockProver.verifySingle(
          proof.chainKey,
          proof.headerNumber,
          proof.txBytes,
          proof.merkleProof,
          proof.continuityProof,
        );
      } catch (error) {
        this.log("block_prover.verification_failed", {
          error: errorMessage(error),
        });
        return failure(
          "CREDITCOIN_VERIFICATION_FAILED",
          "The native Creditcoin BlockProver call failed",
        );
      }
      this.log("block_prover.verification_result", {
        chainKey: proof.chainKey,
        headerNumber: proof.headerNumber,
        transactionIndex: transactionIndex.toString(),
        verified,
      });
      if (!verified) {
        return failure(
          "CREDITCOIN_VERIFICATION_FAILED",
          "Creditcoin rejected the transaction inclusion proof",
        );
      }

      let transaction;
      try {
        transaction = decodeAttestedTransaction(proof.txBytes);
      } catch {
        return failure(
          "MISSING_TRANSACTION_CONTEXT",
          "The verified transaction context is malformed",
        );
      }
      if (
        transaction.hash.toLowerCase() !==
        reference.transactionHash.toLowerCase()
      ) {
        return failure(
          "TRANSACTION_HASH_MISMATCH",
          "The verified transaction bytes hash to another transaction",
        );
      }
      if (transaction.receiptStatus !== sourceReceipt.status) {
        return failure(
          "INVALID_PROOF",
          "The proof receipt status does not match the source receipt",
        );
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
    } catch (error) {
      this.log("provider.unexpected_failure", {
        error: errorMessage(error),
      });
      return failure(
        "PROVIDER_FAILURE",
        "A source-chain or Creditcoin provider call failed",
      );
    }
  }

  private get proofBuilderHostname(): string {
    return new URL(this.config.ATTESTCOIN_PROOF_BUILDER_URL).hostname;
  }

  private log(event: string, details: Record<string, unknown>): void {
    this.logger.info(`attestcoin.${event}`, details);
  }
}

function proofProviderStatusCode(
  error: string | undefined,
): number | undefined {
  const match = error?.match(/status code '?(\d{3})'?/i);
  return match ? Number(match[1]) : undefined;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function failure(
  code: VerificationFailureCode,
  message: string,
): ProofVerificationResult {
  return { ok: false, code, message };
}
