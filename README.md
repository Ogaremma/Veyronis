<p align="center">
  <img src="frontend/app/icon.svg" alt="Veyronis logo" width="96" height="96">
</p>

# Veyronis

**Cross-chain escrow and dispute resolution using Attestcoin-verified evidence on Creditcoin.**

Veyronis is a self-custodial cross-chain escrow and dispute-resolution system. A buyer creates an agreement with participants, payment requirements, and evidence policies. Funds are held by a dedicated escrow contract on Ethereum Sepolia. Evidence of an obligation can come from a source blockchain. Attestcoin and Creditcoin verify the source transaction and block before Veyronis records the verified evidence and authorizes escrow settlement.

[![Frontend](https://img.shields.io/badge/Frontend-veyronis--proof.vercel.app-3c8cff)](https://veyronis-proof.vercel.app/)
[![Backend](https://img.shields.io/badge/Backend-veyronis--dtxp.onrender.com-6bd7ff)](https://veyronis-dtxp.onrender.com/)
[![Project deck](https://img.shields.io/badge/Project_deck-PDF-4de3ae)](docs/Veyronis-Project-Deck.pdf)

## Problem

Cross-chain agreements create a trust gap: the event that proves an obligation happened on one chain, while the funds and settlement rules live on another. Participants often bridge that gap by trusting a marketplace, escrow agent, bridge operator, or manual screenshot review. Those intermediaries add cost, delays, custody risk, and dispute ambiguity.

Traditional escrow can hold funds, but it cannot independently verify a fact on another blockchain. A source-transaction hash by itself is not sufficient proof—it can be copied, replayed, taken out of context, or submitted against the wrong agreement.

## Solution

Veyronis separates custody from verification:

- **Self-custodial escrow:** the buyer funds a dedicated `VeyronisEscrow` contract on Ethereum Sepolia. Participant transactions are signed in the user's wallet; ordinary backend sessions cannot move escrowed funds.
- **Evidence policies:** each agreement commits to the source chain, expected transaction context, participants, amount, asset, and evidence rules before funds are released.
- **Independently verified cross-chain evidence:** Attestcoin/USC and Creditcoin verify the source transaction and its source block before Veyronis accepts the evidence.
- **Authorized settlement:** a verified claim is submitted through `EvidenceClaimRegistry`. It satisfies the escrow condition; it does not itself transfer escrow funds.
- **Explicit withdrawal:** after settlement, the escrow credits the seller's internal withdrawal balance. The seller signs a separate withdrawal transaction.

For disputes, verified evidence is recorded as an advisory claim. The arbitrator still decides custody. This keeps cryptographic evidence useful without removing human judgment from subjective disputes.

## Why Cross-Chain Evidence Matters

Cross-chain commerce, service agreements, and milestone payments require objective proof that an obligation occurred on a different network. Veyronis makes that evidence verifiable and agreement-specific:

- The exact source transaction is bound to the expected source chain.
- The source block must be attested on Creditcoin before a proof is accepted.
- Creditcoin's BlockProver verifies transaction inclusion and attested block continuity.
- The decoded transaction must satisfy the agreement's immutable evidence policy.
- The resulting claim is bound to one escrow and agreement commitment.
- The same source evidence cannot be replayed against a different escrow or agreement.

This turns a cross-chain transaction from a pasted hash into an authenticated, policy-checked condition.

## USC / Creditcoin and Attestcoin Integration

Veyronis uses USC/Creditcoin as the verification layer, not as the escrow custody layer:

1. A participant submits a source transaction hash from Ethereum Sepolia.
2. The backend performs Attestcoin validation and confirms the configured Sepolia chain context.
3. Veyronis waits until Creditcoin has attested the transaction's source block.
4. Proof Builder generates the transaction inclusion proof.
5. Creditcoin BlockProver cryptographically verifies the proof.
6. Veyronis decodes the attested transaction and validates it against the agreement's evidence policy.
7. The authorized verifier records the normalized claim in `EvidenceClaimRegistry`.
8. For a direct blockchain condition, the registry authorizes escrow condition settlement.
9. The escrow credits the seller's withdrawal balance; the seller separately withdraws.

Attestcoin does not directly transfer escrow funds. Creditcoin does not hold the escrow funds. Escrow custody and settlement remain on Ethereum Sepolia, while Creditcoin supplies the trusted source-block attestation and proof verification.

## Architecture and Verification Flow

```text
Source transaction
  → Attestcoin validation
  → Creditcoin source-block attestation
  → Proof Builder
  → Creditcoin BlockProver
  → attested transaction decoding
  → evidence-policy validation
  → EvidenceClaimRegistry
  → escrow condition settlement
  → seller withdrawal
```

### Components

| Component | Responsibility |
| --- | --- |
| **Frontend** | Wallet connection, agreement creation, funding, verification requests, dispute workflows, withdrawal, and status display. |
| **Backend** | Attestcoin orchestration, source-chain monitoring, proof coordination, policy validation, API, and reconciliation. |
| **PostgreSQL** | Searchable metadata, evidence references, verification records, and timestamps. It is not authoritative for balances or settlement. |
| **Ethereum Sepolia** | Hosts `VeyronisEscrow` and `EvidenceClaimRegistry`; escrow funds remain on this chain. |
| **Creditcoin testnet** | Supplies source-block attestation and native BlockProver verification. |
| **Attestcoin / USC** | Supplies the proof and verification integration used to validate the source transaction. |
| **`VeyronisEscrow`** | Authoritative custody, lifecycle, dispute decisions, condition settlement, and withdrawal credits. |
| **`EvidenceClaimRegistry`** | Records verified evidence and authorizes the matching escrow condition. |

The frontend signs participant escrow transactions directly through the user's wallet. The backend indexes contract events and stores derived records, but contract state remains authoritative. PostgreSQL is a convenience and reconciliation layer.

## Escrow Lifecycle

1. **Create agreement:** the buyer defines participants, payment requirements, and the evidence policy; a dedicated escrow contract is deployed.
2. **Fund escrow:** the buyer signs the exact required deposit on Ethereum Sepolia. The escrow moves to `AwaitingDelivery`.
3. **Submit source evidence:** the participant submits the Sepolia source transaction hash. Verification is request-triggered and polls Creditcoin during each verification request.
4. **Wait for source-block attestation:** if the transaction exists but its source block is not yet attested, Veyronis stores `SOURCE_BLOCK_NOT_ATTESTED`. This is a safe waiting state, not a failed transaction, and can be retried through the existing UI.
5. **Verify and validate:** after attestation, Proof Builder and Creditcoin BlockProver verify inclusion; the decoded transaction is checked against the evidence policy.
6. **Record the verified claim:** `EvidenceClaimRegistry` records the agreement-bound claim.
7. **Settle the condition:** for a direct blockchain condition, the escrow moves to `Complete` and credits the seller's internal withdrawal balance.
8. **Withdraw:** the seller signs a separate withdrawal transaction to receive the credited funds.

The backend does **not** automatically retry verification in the background. A user can retry an eligible stored condition through the UI, and each new verification request polls the current Creditcoin attestation state.

Disputes use a separate boundary: a verified dispute claim is advisory, and the arbitrator resolves custody. A source-transaction hash alone can never unlock or transfer escrow funds.

## Production Deployment

| Item | Value |
| --- | --- |
| Frontend | <https://veyronis-proof.vercel.app/> |
| Backend | <https://veyronis-dtxp.onrender.com/> |
| Escrow chain | Ethereum Sepolia, chain ID `11155111` |
| Verification chain | Creditcoin testnet, chain ID `102031` |
| `EvidenceClaimRegistry` | `0x8eDA7318A0f01Fe0838e97742F5770E2c4Fd999D` |

### Confirmed production flow

- Successful source transaction: `0xe239b7db437c434e3aca54503b4908cf9c91f0cde386699a490cce4d7f46493e`
- Successful escrow: `0x62E251a844b1414cC73Eab91bC8f2Eee8bE9c1eA`
- The escrow reached `Complete`, credited the seller's withdrawal balance, and the seller successfully withdrew.

A separate current test uses source transaction `0xbd47cd54bc5caf34cce742fcb54ea76921684645f5fec744d6855cbd91d148e6`, a valid Sepolia transaction at block `11706616`. Its source block is awaiting Creditcoin attestation. Veyronis correctly reports this as an attestation waiting state rather than a failed source transaction.

## Demo Flow

1. Open the [production frontend](https://veyronis-proof.vercel.app/) and connect a Sepolia wallet.
2. Create a live agreement with buyer, seller, arbitrator, payment amount, and source-chain evidence policy.
3. Fund the dedicated escrow contract with the exact required amount.
4. Submit the source transaction hash for verification.
5. Watch the condition remain locked until Creditcoin attests the source block; retry from the UI if the stored condition reports `SOURCE_BLOCK_NOT_ATTESTED`.
6. After successful verification, inspect the verified source facts, accepted claim, and escrow state.
7. Confirm that the seller's internal withdrawal balance is credited.
8. Have the seller sign the separate withdrawal transaction.

## Technology Stack

- Next.js `15.5.2`
- React `19.1.1`
- TypeScript
- Wagmi `2.19.5`
- Viem
- Ethers
- Native Node.js/TypeScript backend
- PostgreSQL
- Foundry
- Ethereum Sepolia
- Creditcoin
- Attestcoin

## Run Locally

The repository is an npm workspace. Local development uses Anvil as a deterministic EVM environment, PostgreSQL in Docker, and a local mock verifier for integration coverage.

### Prerequisites

- Node.js `24` or newer
- npm
- Docker
- Foundry (`forge` and `anvil`)

### Start the local stack

```bash
npm install
npm run dev:chain
npm run dev:db
npm run dev:deploy
npm run dev:env
npm run dev:migrate
npm run dev:backend
npm run dev:frontend
```

Run the chain, database, backend, and frontend commands in separate terminals as needed. The scripts create ignored local environment files and deploy the local registry artifact. Add your own WalletConnect project ID to `frontend/.env.local` if you need WalletConnect locally.

### Build and test

```bash
npm run typecheck
npm test
npm run build
forge test --root contracts
```

## Known Limitations and Prototype Status

- The live deployment is a hackathon prototype on Ethereum Sepolia and Creditcoin testnet; it is not a mainnet deployment.
- Verification is request-triggered. The backend polls Creditcoin during each verification request but does not run an automatic background retry.
- Source-block attestation is asynchronous. A valid transaction may remain in the `SOURCE_BLOCK_NOT_ATTESTED` waiting state until Creditcoin attests its block.
- The authorized verifier is a security-sensitive operational role; compromise of its key could let invalid claims reach the registry.
- PostgreSQL stores metadata only. Escrow state, withdrawal credits, and settlement remain authoritative on chain.
- The local Anvil mock verifier exists for local integration coverage and is not a substitute for the production Attestcoin/Creditcoin verifier.

See [ARCHITECTURE.md](ARCHITECTURE.md) for the detailed security model, trust boundaries, and prototype phases.

## Project Materials

- [Project deck](docs/Veyronis-Project-Deck.pdf)
- [Architecture](ARCHITECTURE.md)
- [Production frontend](https://veyronis-proof.vercel.app/)
- [Production backend](https://veyronis-dtxp.onrender.com/)
