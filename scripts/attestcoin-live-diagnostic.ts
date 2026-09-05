import { JsonRpcProvider } from "ethers";
import { chainInfo } from "@gluwa/usc-sdk";

const rpcUrl = process.env.CREDITCOIN_RPC_URL;
const proofBuilderUrl = process.env.CREDITCOIN_PROOF_BUILDER_URL;
const sourceChainKey = Number(process.env.SOURCE_CHAIN_KEY ?? "");
const probeEndpoints = process.argv.includes("--probe-endpoints");
const candidates = [
  "https://prover.cc3-testnet.creditcoin.network/",
  "https://proof-gen-api.cc3-testnet.creditcoin.network/",
  "https://proof-gen-api.usc-testnet2.creditcoin.network/",
];

if (!rpcUrl || !proofBuilderUrl || !Number.isInteger(sourceChainKey) || sourceChainKey <= 0) {
  console.error("Required environment: CREDITCOIN_RPC_URL, CREDITCOIN_PROOF_BUILDER_URL, SOURCE_CHAIN_KEY");
  process.exitCode = 2;
} else {
  async function run(): Promise<void> {
    console.log(`RPC URL: ${rpcUrl}`);
    const [chainId, latestBlock] = await Promise.all([
      rpcCall("eth_chainId"),
      rpcCall("eth_blockNumber"),
    ]);
    const provider = new JsonRpcProvider(rpcUrl, undefined, { staticNetwork: true });
    const chainInfoProvider = new chainInfo.PrecompileChainInfoProvider(provider);
    const [supported, selected, latestAttested, genesis] = await Promise.all([
      chainInfoProvider.getSupportedChains(),
      chainInfoProvider.getSupportedChainByKey(sourceChainKey),
      chainInfoProvider.getLatestAttestedHeightAndHash(sourceChainKey),
      chainInfoProvider.getAttestationGenesisHeight(sourceChainKey),
    ]);
    console.log(`Creditcoin chain ID: ${BigInt(chainId).toString()}`);
    console.log(`Latest block: ${BigInt(latestBlock).toString()}`);
    console.log(`Source chain key: ${sourceChainKey}`);
    console.log(`Source chain ID: ${selected?.chainId ?? "NOT_FOUND"}`);
    console.log(`Source chain name: ${selected?.chainName ?? "NOT_FOUND"}`);
    console.log(`Supported chain count: ${supported.length}`);
    console.log(`Latest attested height: ${latestAttested.height} (exists=${latestAttested.exists})`);
    console.log(`Attestation genesis height: ${genesis}`);
    await probe(proofBuilderUrl, sourceChainKey);
    if (probeEndpoints) for (const endpoint of candidates) await probe(endpoint, sourceChainKey);
  }

  async function rpcCall(method: string): Promise<string> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 10000);
    try {
      const response = await fetch(rpcUrl!, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ jsonrpc: "2.0", method, params: [], id: 1 }),
        signal: controller.signal,
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const body = (await response.json()) as { result?: string; error?: { message?: string } };
      if (!body.result) throw new Error(body.error?.message ?? "JSON-RPC response had no result");
      return body.result;
    } catch (error) {
      throw new Error(`CC3 RPC ${method} failed: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      clearTimeout(timer);
    }
  }

  async function probe(baseUrl: string, key: number): Promise<void> {
    const endpoint = `${baseUrl.replace(/\/$/, "")}/api/v1/attested-height/${key}`;
    try {
      const response = await fetch(endpoint);
      const body = await response.text();
      console.log(`Proof Builder: ${endpoint}`);
      console.log(`HTTP status: ${response.status}`);
      console.log(`Response: ${body}`);
    } catch (error) {
      console.error(`Proof Builder: ${endpoint}`);
      console.error(`Network error: ${error instanceof Error ? error.message : String(error)}`);
      console.error("Failure category: NETWORK_OR_TLS");
    }
  }

  run().catch((error) => {
    console.error(`Diagnostic failed: ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  });
}
