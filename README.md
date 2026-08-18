# Veyronis

Cross-chain escrow and dispute resolution using Attestcoin-verified evidence on Creditcoin.

See [ARCHITECTURE.md](./ARCHITECTURE.md) for the initial design and prototype scope.

Phase 5 binds each escrow to an immutable evidence-policy commitment. The Attestcoin adapter verifies source transaction inclusion, evaluates native or ERC-20 payment facts against that policy, enforces a verified source-block window, and submits advisory evidence to `EvidenceClaimRegistry`. Live use requires the environment variables documented in `.env.example`; local tests use no credentials or network access.

## Workspace commands

```bash
npm install
npm run typecheck
npm test
forge build
forge test -vvv
```

## Agreement creation

Apply `backend/sql/001_create_agreements.sql` to the selected PostgreSQL database, run `npm run build`, then start the agreement backend with `npm run start --workspace @veyronis/backend`. Run the agreement-creation UI with `npm run dev --workspace @veyronis/frontend`. The UI builds a shared, canonical evidence policy and shows the policy and agreement commitments before review. Deployment is routed to the backend boundary and requires a separately configured deployer; the frontend never receives a private key.

Apply `backend/sql/002_create_agreement_reconciliations.sql` when upgrading a Phase 7 database. It records append-only comparison results and never stores authoritative financial state.

The backend deployment service uses `DEPLOYER_RPC_URL` and `DEPLOYER_PRIVATE_KEY`. Attestcoin verification separately uses `CREDITCOIN_RPC_URL`, `ATTESTCOIN_PROOF_BUILDER_URL`, `SEPOLIA_CHAIN_KEY`, `VEYRONIS_EVIDENCE_REGISTRY_ADDRESS`, and `VEYRONIS_VERIFIER_PRIVATE_KEY`. `DATABASE_URL` is needed only when wiring the provided PostgreSQL metadata repository. `.env.example` contains names only. No real credentials, endpoints, or private keys are committed.

PostgreSQL stores agreement metadata and deployment workflow state only. Creditcoin contracts remain authoritative for custody, deposits, dispute state, evidence acceptance, settlements, and withdrawals.

## Phase 7 dashboard

Open `/dashboard` to authenticate with a participant wallet. The backend issues a one-time challenge, verifies the wallet signature, and maintains an HttpOnly session cookie. Authenticated dashboard reads combine PostgreSQL metadata with fresh escrow contract calls and indexed escrow events. The database never becomes a source of balances or settlement state. Actions on the detail page are submitted by the connected wallet; evidence records are displayed as advisory context.

## Phase 8 participant lifecycle

The detail dashboard exposes only role-and-state-valid wallet actions, tracks each transaction through wallet signature, submission, confirmation, and reconciliation, and reports receipt data without treating a hash as success. The backend enriches and reconciles chain reads but has no endpoint or participant signer capable of moving funds.

`NEXT_PUBLIC_CHAIN_ID` and `NEXT_PUBLIC_EXPLORER_URL` are optional public values used to create network-correct transaction links. Neither is secret; participant keys remain exclusively in the wallet.
