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

The backend deployment service uses `DEPLOYER_RPC_URL` and `DEPLOYER_PRIVATE_KEY`. Attestcoin verification separately uses `CREDITCOIN_RPC_URL`, `ATTESTCOIN_PROOF_BUILDER_URL`, `SEPOLIA_CHAIN_KEY`, `VEYRONIS_EVIDENCE_REGISTRY_ADDRESS`, and `VEYRONIS_VERIFIER_PRIVATE_KEY`. `DATABASE_URL` is needed only when wiring the provided PostgreSQL metadata repository. `.env.example` contains names only. No real credentials, endpoints, or private keys are committed.

PostgreSQL stores agreement metadata and deployment workflow state only. Creditcoin contracts remain authoritative for custody, deposits, dispute state, evidence acceptance, settlements, and withdrawals.
