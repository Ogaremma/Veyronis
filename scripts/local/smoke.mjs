import { readFile } from "node:fs/promises";
import { AbiCoder, Contract, ContractFactory, JsonRpcProvider, Wallet, NonceManager, ZeroAddress, id, keccak256, toUtf8Bytes } from "ethers";
import pg from "pg";
import { localAccounts, LOCAL_CHAIN_ID, LOCAL_RPC_URL } from "./local-accounts.mjs";

const api = process.env.NEXT_PUBLIC_BACKEND_URL ?? "http://127.0.0.1:3001";
const deployment = JSON.parse(await readFile("local/contracts.json", "utf8"));
const escrowArtifact = JSON.parse(await readFile("contracts/out/VeyronisEscrow.sol/VeyronisEscrow.json", "utf8"));
const registryArtifact = JSON.parse(await readFile("contracts/out/EvidenceClaimRegistry.sol/EvidenceClaimRegistry.json", "utf8"));
const provider = new JsonRpcProvider(process.env.LOCAL_RPC_URL ?? LOCAL_RPC_URL);
const accounts = Object.fromEntries(localAccounts().map((account) => {
  const signer = new NonceManager(new Wallet(account.privateKey, provider));
  signer.address = account.address;
  return [account.role, signer];
}));
const rpcNetwork = await provider.getNetwork();
if (rpcNetwork.chainId !== BigInt(process.env.LOCAL_CHAIN_ID ?? LOCAL_CHAIN_ID)) throw new Error("Unexpected local chain ID");
const balances = await Promise.all(Object.values(accounts).map((wallet) => provider.getBalance(wallet.address)));
if (balances.some((balance) => balance === 0n)) throw new Error("Expected funded Anvil accounts");
if ((await provider.getCode(deployment.evidenceRegistry)) === "0x") throw new Error("Local registry is not deployed");

let cookie = "";
async function request(path, body, method = "POST") {
  const response = await fetch(`${api}${path}`, { method, headers: { "content-type": "application/json", ...(cookie ? { cookie } : {}) }, body: method === "GET" ? undefined : JSON.stringify(body) });
  if (!response.ok) throw new Error(`Backend request failed: ${path} (${response.status})`);
  return response.json();
}
async function buyerSession() {
  const challenge = await request("/auth/challenge", { address: accounts.buyer.address });
  const signature = await accounts.buyer.signMessage(challenge.message);
  const response = await fetch(`${api}/auth/verify`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ address: accounts.buyer.address, signature }) });
  if (!response.ok) throw new Error("Backend wallet authentication failed");
  cookie = response.headers.get("set-cookie")?.split(";")[0] ?? "";
  if (!cookie) throw new Error("Backend did not issue a session cookie");
}
function draft(label) {
  return { buyer: accounts.buyer.address, seller: accounts.seller.address, arbitrator: accounts.arbitrator.address,
    requiredAmount: "100000000000000000", agreementNonce: keccak256(toUtf8Bytes(`local-smoke:${label}:${Date.now()}`)), evidenceRegistry: deployment.evidenceRegistry,
    policy: { version: 1, evidenceType: id("SOURCE_PAYMENT"), sourceChainKey: 1, assetKind: "native", expectedSourceContract: ZeroAddress, expectedRecipient: accounts.seller.address, expectedAsset: ZeroAddress, expectedSender: accounts.buyer.address, amountRule: "exact", amount: "100000000000000000", minSourceBlock: "0", maxSourceBlock: "0", calldataSelector: "0x00000000", requireTransferEvent: false } };
}
async function createThroughBackend(label) {
  const agreement = await request("/agreements", draft(label));
  const deployed = await request(`/agreements/${agreement.id}/confirm`, {});
  if (deployed.deploymentStatus !== "DEPLOYED" || !deployed.escrowAddress) throw new Error("Backend did not deploy escrow");
  return deployed;
}
async function createDirect(label) {
  const data = draft(label);
  const coder = AbiCoder.defaultAbiCoder();
  const policyCommitment = keccak256(coder.encode(["uint8","bytes32","uint64","uint8","address","address","address","address","uint8","uint256","uint64","uint64","bytes4","bool"], [1,data.policy.evidenceType,1,0,ZeroAddress,data.policy.expectedRecipient,ZeroAddress,data.policy.expectedSender,0,data.policy.amount,0,0,"0x00000000",false]));
  const agreementCommitment = keccak256(coder.encode(["address","address","address","uint256","bytes32","bytes32","address"], [data.buyer,data.seller,data.arbitrator,data.requiredAmount,policyCommitment,data.agreementNonce,data.evidenceRegistry]));
  const factory = new ContractFactory(escrowArtifact.abi, escrowArtifact.bytecode.object, accounts.deployer);
  const escrow = await factory.deploy(data.buyer, data.seller, data.arbitrator, agreementCommitment, policyCommitment, data.requiredAmount, data.evidenceRegistry);
  await escrow.waitForDeployment();
  return { escrow: new Contract(await escrow.getAddress(), escrowArtifact.abi, provider), data, policyCommitment, agreementCommitment };
}

await buyerSession();
const delivery = await createThroughBackend("delivery");
const deliveryEscrow = new Contract(delivery.escrowAddress, escrowArtifact.abi, provider);
const deposit = await deliveryEscrow.connect(accounts.buyer).deposit({ value: delivery.requiredAmount }); await deposit.wait();
const confirm = await deliveryEscrow.connect(accounts.buyer).confirmDelivery(); await confirm.wait();
const withdrawSeller = await deliveryEscrow.connect(accounts.seller).withdraw(); await withdrawSeller.wait();
if (await deliveryEscrow.state() !== 4n) throw new Error("Delivery scenario did not complete");

const buyerWin = await createDirect("buyer-win");
const buyerDeposit = await buyerWin.escrow.connect(accounts.buyer).deposit({ value: buyerWin.data.requiredAmount }); await buyerDeposit.wait();
const buyerEvidence = id("buyer-dispute");
const buyerDispute = await buyerWin.escrow.connect(accounts.buyer).openDispute(buyerEvidence); await buyerDispute.wait();
const buyerResolve = await buyerWin.escrow.connect(accounts.arbitrator).resolveDispute(1); await buyerResolve.wait();
const buyerWithdraw = await buyerWin.escrow.connect(accounts.buyer).withdraw(); await buyerWithdraw.wait();
if (await buyerWin.escrow.state() !== 5n) throw new Error("Buyer dispute scenario did not refund");

const sellerWin = await createDirect("seller-win");
const sellerDeposit = await sellerWin.escrow.connect(accounts.buyer).deposit({ value: sellerWin.data.requiredAmount }); await sellerDeposit.wait();
const sourceHash = id("local-mock-source-transaction");
const registry = new Contract(deployment.evidenceRegistry, registryArtifact.abi, accounts.verifier);
const evidenceCommitment = await registry.computeEvidenceCommitment(sellerWin.policyCommitment, id("SOURCE_PAYMENT"), 1, sourceHash, accounts.seller.address);
const sellerDispute = await sellerWin.escrow.connect(accounts.seller).openDispute(evidenceCommitment); await sellerDispute.wait();
// LocalMockAttestcoinVerifier: direct registry submission only; it does not prove an Attestcoin fact.
const claimTx = await registry.submitVerifiedClaim([await sellerWin.escrow.getAddress(), sellerWin.agreementCommitment, sellerWin.policyCommitment, evidenceCommitment, id("SOURCE_PAYMENT"), 1, sourceHash, accounts.seller.address]); await claimTx.wait();
const sellerResolve = await sellerWin.escrow.connect(accounts.arbitrator).resolveDispute(0); await sellerResolve.wait();
const sellerWithdraw = await sellerWin.escrow.connect(accounts.seller).withdraw(); await sellerWithdraw.wait();
if (await sellerWin.escrow.state() !== 4n) throw new Error("Seller dispute scenario did not complete");

const refund = await createDirect("approved-refund");
const refundDeposit = await refund.escrow.connect(accounts.buyer).deposit({ value: refund.data.requiredAmount }); await refundDeposit.wait();
const refundRequest = await refund.escrow.connect(accounts.buyer).requestRefund(id("refund-request")); await refundRequest.wait();
const refundApproval = await refund.escrow.connect(accounts.seller).approveRefund(); await refundApproval.wait();
const refundWithdraw = await refund.escrow.connect(accounts.buyer).withdraw(); await refundWithdraw.wait();
const cancellation = await createDirect("cancelled");
const cancelTx = await cancellation.escrow.connect(accounts.buyer).cancel(); await cancelTx.wait();

const eventContracts = [deliveryEscrow, buyerWin.escrow, sellerWin.escrow, refund.escrow, cancellation.escrow];
const observedEvents = new Set();
for (const contract of eventContracts) {
  for (const event of await contract.queryFilter("*", 0, "latest")) observedEvents.add(event.fragment?.name);
}
for (const event of await registry.queryFilter("*", 0, "latest")) observedEvents.add(event.fragment?.name);
for (const expected of ["Deposited", "DeliveryConfirmed", "RefundRequested", "RefundApproved", "DisputeOpened", "DisputeResolved", "Cancelled", "Withdrawn", "VerifiedEvidenceRecorded", "VerifiedClaimAccepted"]) {
  if (!observedEvents.has(expected)) throw new Error(`Missing actual local event: ${expected}`);
}

const dashboard = await request(`/agreements/${delivery.id}`, undefined, "GET");
if (!dashboard.timeline.some((event) => event.name === "Deposited") || !dashboard.timeline.some((event) => event.name === "Withdrawn")) throw new Error("Backend did not index local escrow events");
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
await pool.query("UPDATE agreements SET required_amount='1' WHERE id=$1", [delivery.id]);
const stale = await request(`/agreements/${delivery.id}`, undefined, "GET");
await pool.end();
if (stale.reconciliation?.status !== "METADATA_STALE" || stale.chain.requiredAmount !== delivery.requiredAmount) throw new Error("Blockchain did not override stale metadata");
console.log(JSON.stringify({ chainId: Number(rpcNetwork.chainId), rpcUrl: process.env.LOCAL_RPC_URL ?? LOCAL_RPC_URL, registry: deployment.evidenceRegistry, delivery: { agreement: delivery.escrowAddress, deposit: deposit.hash, confirm: confirm.hash, withdraw: withdrawSeller.hash }, buyerWin: { agreement: await buyerWin.escrow.getAddress(), deposit: buyerDeposit.hash, dispute: buyerDispute.hash, resolve: buyerResolve.hash, withdraw: buyerWithdraw.hash }, sellerWin: { agreement: await sellerWin.escrow.getAddress(), deposit: sellerDeposit.hash, dispute: sellerDispute.hash, evidence: claimTx.hash, resolve: sellerResolve.hash, withdraw: sellerWithdraw.hash }, approvedRefund: { agreement: await refund.escrow.getAddress(), deposit: refundDeposit.hash, request: refundRequest.hash, approve: refundApproval.hash, withdraw: refundWithdraw.hash }, cancellation: { agreement: await cancellation.escrow.getAddress(), cancel: cancelTx.hash }, observedEvents: [...observedEvents].sort(), indexedEvents: dashboard.timeline.map((event) => event.name), reconciliation: stale.reconciliation }, null, 2));
