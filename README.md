# Veyronis

Cross-chain escrow and dispute resolution using Attestcoin-verified evidence on Creditcoin.

See [ARCHITECTURE.md](./ARCHITECTURE.md) for the initial design and prototype scope.

Phase 4 provides a deterministic, testable Attestcoin adapter that verifies source transaction inclusion through Creditcoin's SDK-defined precompile, semantically matches the result to an active escrow dispute, and submits advisory evidence to `EvidenceClaimRegistry`. Live use requires the environment variables documented in `.env.example`; local tests use no credentials or network access.

## Workspace commands

```bash
npm install
npm run typecheck
npm test
forge build
forge test -vvv
```
