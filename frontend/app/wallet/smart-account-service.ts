import { privateKeyToAccount } from "viem/accounts";
import { createPublicClient, http, type Address, type Hex, type PublicClient, type Chain } from "viem";
import { anvil, sepolia } from "viem/chains";
import { toSimpleSmartAccount } from "permissionless/accounts";
import { createBundlerClient, entryPoint08Address, type UserOperation } from "viem/account-abstraction";

export type AaNetwork = "anvil" | "sepolia";
export interface AaConfig { network: AaNetwork; rpcUrl: string; bundlerUrl?: string | undefined; chainId?: number | undefined; }
export interface UserOperationResult { userOperation: UserOperation<"0.8">; userOperationHash?: Hex | undefined; transactionHash?: Hex | undefined; }
export interface AaReceipt { success: boolean; receipt: { transactionHash: Hex; status: "success" | "reverted" }; }
export interface AaLifecycleClient {
  prepareUserOperation(args: { calls: ReturnType<typeof buildNoopCall>[] }): Promise<UserOperation<"0.8">>;
  estimateUserOperationGas(args: { userOperation: UserOperation<"0.8"> }): Promise<unknown>;
  sendUserOperation(args: { userOperation: UserOperation<"0.8"> }): Promise<Hex>;
  waitForUserOperationReceipt(args: { hash: Hex }): Promise<AaReceipt>;
}

export const ENTRYPOINT_V08 = entryPoint08Address;

export function readAaConfig(env: Record<string, string | undefined> = process.env): AaConfig {
  const network = (env.NEXT_PUBLIC_AA_NETWORK ?? "anvil") as AaNetwork;
  if (network !== "anvil" && network !== "sepolia") throw new Error("NEXT_PUBLIC_AA_NETWORK must be anvil or sepolia");
  const rpcUrl = network === "sepolia" ? env.NEXT_PUBLIC_SEPOLIA_RPC_URL : env.NEXT_PUBLIC_ANVIL_RPC_URL;
  if (!rpcUrl) throw new Error(`Missing RPC URL for ${network}`);
  return { network, rpcUrl, bundlerUrl: env.NEXT_PUBLIC_AA_BUNDLER_URL, chainId: network === "sepolia" ? 11155111 : 31337 };
}

function chainFor(config: AaConfig): Chain { return config.network === "sepolia" ? sepolia : anvil; }

export async function deriveSmartAccount(ownerPrivateKey: string, config: AaConfig, index = 0n) {
  const owner = privateKeyToAccount(ownerPrivateKey as `0x${string}`);
  const client = createPublicClient({ chain: chainFor(config), transport: http(config.rpcUrl) });
  return toSimpleSmartAccount({ client, owner, entryPoint: { address: ENTRYPOINT_V08, version: "0.8" }, index });
}

export async function isSmartAccountDeployed(client: PublicClient, address: Address): Promise<boolean> {
  return (await client.getBytecode({ address })) !== undefined;
}

export function buildNoopCall(to: Address) { return { to, value: 0n, data: "0x" as Hex }; }

export async function buildUserOperation(client: AaLifecycleClient, smartAccountAddress: Address) {
  return client.prepareUserOperation({ calls: [buildNoopCall(smartAccountAddress)] });
}

export async function estimateUserOperation(client: AaLifecycleClient, userOperation: UserOperation<"0.8">) {
  return client.estimateUserOperationGas({ userOperation });
}

export async function submitAndWait(client: AaLifecycleClient, userOperation: UserOperation<"0.8">): Promise<UserOperationResult> {
  const userOperationHash = await client.sendUserOperation({ userOperation });
  const result = await client.waitForUserOperationReceipt({ hash: userOperationHash });
  if (!result.success || result.receipt.status !== "success") throw new Error("UserOperation reverted on-chain");
  return { userOperation, userOperationHash, transactionHash: result.receipt.transactionHash };
}

export function createAaService(ownerPrivateKey: string, config: AaConfig) {
  if (!config.bundlerUrl) throw new Error("Missing NEXT_PUBLIC_AA_BUNDLER_URL");
  const chain = chainFor(config);
  const publicClient = createPublicClient({ chain, transport: http(config.rpcUrl) });
  const owner = privateKeyToAccount(ownerPrivateKey as `0x${string}`);
  const accountPromise = toSimpleSmartAccount({ client: publicClient, owner, entryPoint: { address: ENTRYPOINT_V08, version: "0.8" } });
  return { accountPromise, publicClient, bundlerClientPromise: accountPromise.then(account => createBundlerClient({ account, chain, transport: http(config.bundlerUrl!) })) };
}
