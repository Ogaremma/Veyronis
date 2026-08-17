import { AbiCoder, Interface, ZeroAddress, getAddress, id } from "ethers";
import { evidencePolicySchema, type EvidencePolicy } from "@veyronis/shared";
import type { VerificationFailureCode } from "@veyronis/shared";
import type {
  EvidencePolicyEvaluator,
  PolicyEvaluationResult,
  VerifiedSourceTransaction,
} from "./verifier-types.js";

const transferTopic = id("Transfer(address,address,uint256)");
const transferInterface = new Interface(["function transfer(address to,uint256 amount)"]);
const coder = AbiCoder.defaultAbiCoder();

export class SourceTransactionPolicyEvaluator implements EvidencePolicyEvaluator {
  evaluate(transaction: VerifiedSourceTransaction, policy: EvidencePolicy): PolicyEvaluationResult {
    if (!evidencePolicySchema.safeParse(policy).success) {
      return failure("INVALID_POLICY", "Evidence policy is malformed or internally inconsistent");
    }
    if (!Number.isSafeInteger(transaction.sourceBlockNumber) || transaction.sourceBlockNumber < 0) {
      return failure(
        "MISSING_VERIFIED_FRESHNESS_CONTEXT",
        "Verified source block height is unavailable",
      );
    }
    if (transaction.receiptStatus !== 1) {
      return failure("WRONG_EVENT", "The verified source transaction did not succeed");
    }
    if (transaction.sourceChainKey !== policy.sourceChainKey) {
      return failure("UNSUPPORTED_SOURCE_CHAIN", "Verified source chain does not satisfy the policy");
    }
    if (!sameAddress(transaction.from, policy.expectedSender)) {
      return failure("SUBJECT_MISMATCH", "Verified sender does not satisfy the policy");
    }
    if (
      policy.expectedSourceContract !== ZeroAddress &&
      (!transaction.to || !sameAddress(transaction.to, policy.expectedSourceContract))
    ) {
      return failure("WRONG_SOURCE_CONTRACT", "Verified transaction target does not satisfy the policy");
    }
    if (BigInt(policy.minSourceBlock) > BigInt(transaction.sourceBlockNumber)) {
      return failure("STALE_EVIDENCE", "Verified transaction predates the evidence window");
    }
    if (
      BigInt(policy.maxSourceBlock) !== 0n &&
      BigInt(transaction.sourceBlockNumber) > BigInt(policy.maxSourceBlock)
    ) {
      return failure("STALE_EVIDENCE", "Verified transaction is after the evidence deadline");
    }

    return policy.assetKind === "native"
      ? evaluateNative(transaction, policy)
      : evaluateErc20(transaction, policy);
  }
}

function evaluateNative(
  transaction: VerifiedSourceTransaction,
  policy: EvidencePolicy,
): PolicyEvaluationResult {
  if (!transaction.to || !sameAddress(transaction.to, policy.expectedRecipient)) {
    return failure("WRONG_RECIPIENT", "Native payment recipient does not satisfy the policy");
  }
  const amountFailure = checkAmount(BigInt(transaction.value), policy);
  if (amountFailure) return amountFailure;
  return success(policy, transaction.value);
}

function evaluateErc20(
  transaction: VerifiedSourceTransaction,
  policy: EvidencePolicy,
): PolicyEvaluationResult {
  if (BigInt(transaction.value) !== 0n) {
    return failure("WRONG_ASSET", "ERC-20 evidence cannot be inferred from native value");
  }
  if (policy.calldataSelector !== "0x00000000") {
    if (!transaction.data.toLowerCase().startsWith(policy.calldataSelector.toLowerCase())) {
      return failure("WRONG_CALLDATA", "Transaction calldata selector does not satisfy the policy");
    }
    try {
      const decoded = transferInterface.decodeFunctionData("transfer", transaction.data);
      if (!sameAddress(String(decoded[0]), policy.expectedRecipient)) {
        return failure("WRONG_CALLDATA", "Decoded transfer recipient does not satisfy the policy");
      }
      const amountFailure = checkAmount(BigInt(decoded[1]), policy);
      if (amountFailure) return failure("WRONG_CALLDATA", "Decoded transfer amount does not satisfy the policy");
    } catch {
      return failure("WRONG_CALLDATA", "Transaction calldata cannot be decoded with the committed ABI");
    }
  }

  const transferLogs = transaction.logs.filter(
    (log) => log.topics[0]?.toLowerCase() === transferTopic.toLowerCase(),
  );
  if (transferLogs.length === 0) {
    return failure("WRONG_EVENT", "Required ERC-20 Transfer event is missing");
  }
  const assetLogs = transferLogs.filter((log) => sameAddress(log.address, policy.expectedAsset));
  if (assetLogs.length === 0) {
    return failure("WRONG_ASSET", "Transfer event was emitted by another token contract");
  }

  for (const log of assetLogs) {
    if (log.topics.length !== 3) continue;
    try {
      const sender = getAddress(`0x${log.topics[1]!.slice(-40)}`);
      const recipient = getAddress(`0x${log.topics[2]!.slice(-40)}`);
      const [amount] = coder.decode(["uint256"], log.data);
      if (!sameAddress(sender, policy.expectedSender)) continue;
      if (!sameAddress(recipient, policy.expectedRecipient)) continue;
      const amountFailure = checkAmount(BigInt(amount), policy);
      if (amountFailure) return amountFailure;
      return success(policy, String(amount));
    } catch {
      continue;
    }
  }
  return failure("WRONG_EVENT", "No well-formed Transfer event satisfies the committed participants");
}

function checkAmount(amount: bigint, policy: EvidencePolicy): PolicyEvaluationResult | undefined {
  const expected = BigInt(policy.amount);
  if (policy.amountRule === "exact" ? amount !== expected : amount < expected) {
    return failure("WRONG_AMOUNT", "Verified payment amount does not satisfy the policy");
  }
  return undefined;
}

function success(policy: EvidencePolicy, amount: string): PolicyEvaluationResult {
  return {
    ok: true,
    evidence: { evidenceType: policy.evidenceType, subject: policy.expectedSender, amount },
  };
}

function failure(code: VerificationFailureCode, message: string): PolicyEvaluationResult {
  return { ok: false as const, code, message };
}

function sameAddress(left: string, right: string): boolean {
  try {
    return getAddress(left) === getAddress(right);
  } catch {
    return false;
  }
}
