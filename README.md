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
