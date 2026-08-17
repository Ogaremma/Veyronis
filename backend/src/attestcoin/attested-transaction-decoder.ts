import { AbiCoder, Transaction, getAddress } from "ethers";
import type { VerifiedSourceLog } from "./verifier-types.js";

const coder = AbiCoder.defaultAbiCoder();
const COMMON = ["uint64", "uint64", "address", "bool", "address", "uint256", "bytes"];
const RECEIPT = ["uint8", "uint64", "tuple(address,bytes32[],bytes)[]", "bytes"];

export interface DecodedAttestedTransaction {
  hash: string;
  chainId: string;
  from: string;
  to: string | null;
  value: string;
  data: string;
  receiptStatus: number;
  logs: VerifiedSourceLog[];
}

/** Decodes the SDK's verified EVM v1 Merkle-leaf encoding locally. */
export function decodeAttestedTransaction(txBytes: string): DecodedAttestedTransaction {
  const [type, chunks] = coder.decode(["uint8", "bytes[]"], txBytes) as unknown as [bigint, string[]];
  const transactionType = Number(type);
  if (transactionType > 2) {
    throw new Error("Transaction type is not supported by the Phase 5 policy interpreter");
  }
  if (chunks.length < 3) throw new Error("Attested transaction has missing chunks");
  const common = coder.decode(COMMON, chunks[0]!);
  const to = common[3] ? null : getAddress(String(common[4]));
  const typeFields =
    transactionType === 0
      ? coder.decode(["uint128", "uint256", "bytes32", "bytes32"], chunks[1]!)
      : transactionType === 1
        ? coder.decode(
            ["uint64", "uint128", "tuple(address,bytes32[])[]", "uint8", "bytes32", "bytes32"],
            chunks[1]!,
          )
        : coder.decode(
            [
              "uint64",
              "uint128",
              "uint128",
              "tuple(address,bytes32[])[]",
              "uint8",
              "bytes32",
              "bytes32",
            ],
            chunks[1]!,
          );
  const receipt = coder.decode(RECEIPT, chunks[2]!);
  const tx = Transaction.from({
    type: transactionType,
    nonce: common[0],
    gasLimit: common[1],
    to,
    value: common[5],
    data: common[6],
    ...(transactionType === 0
      ? { gasPrice: typeFields[0], signature: { r: typeFields[2], s: typeFields[3], v: typeFields[1] } }
      : transactionType === 1
        ? {
            chainId: typeFields[0],
            gasPrice: typeFields[1],
            accessList: typeFields[2],
            signature: { r: typeFields[4], s: typeFields[5], yParity: typeFields[3] },
          }
        : {
            chainId: typeFields[0],
            maxPriorityFeePerGas: typeFields[1],
            maxFeePerGas: typeFields[2],
            accessList: typeFields[3],
            signature: { r: typeFields[5], s: typeFields[6], yParity: typeFields[4] },
          }),
  });
  if (!tx.hash || !tx.from) throw new Error("Attested transaction has no recoverable signature");

  const logs = (receipt[2] as Array<[string, string[], string]>).map(([address, topics, data]) => ({
    address: getAddress(address),
    topics: topics.map(String),
    data: String(data),
  }));
  return {
    hash: tx.hash,
    chainId: transactionType === 0 ? "0" : String(typeFields[0]),
    from: getAddress(tx.from),
    to,
    value: String(common[5]),
    data: String(common[6]),
    receiptStatus: Number(receipt[0]),
    logs,
  };
}
