# Attestcoin Competitive Gap Audit

## 1. Veyronis Current Architecture

```text
AttestcoinProofProvider
-> ChainInfo readiness check
-> Proof Builder acquisition
-> BlockProver.verifySingle (read-only)
-> verified transaction decoding
-> semantic policy evaluation
-> EvidenceClaimRegistry submission
-> VeyronisEscrow evidence recording
```

The proof provider is isolated in `backend/src/attestcoin/proof-provider.ts`. The verifier does not treat Proof Builder output as valid evidence; it requires BlockProver verification and then evaluates the immutable Veyronis policy.

## 2. Official Gluwa Pattern

**CONFIRMED FROM INSTALLED SDK `@gluwa/usc-sdk@0.18.0`:**

- `ProofBuilder.getProof(transactionHash)` calls `GET /api/v1/proof-by-tx/{chainKey}/{transactionHash}`.
- `PrecompileChainInfoProvider` uses `0x0000000000000000000000000000000000000fd3`.
- `waitUntilHeightAttested` is available.
- `PrecompileBlockProver.computeTransactionIndex` calls `calculateTxIndex`.
- `verifySingle` is a read-only `staticCall`.
- `verifyAndEmitSingle` submits a transaction and emits `TransactionVerified`.
- Batch methods are `verifyBatch` and `verifyAndEmitBatch`.
- BlockProver precompile: `0x0000000000000000000000000000000000000FD2`.

## 3. CrossCredit Pattern

**UNVERIFIED:** No current CrossCredit repository or deployment was reachable from this environment, so claims about its live behavior are not asserted here.

The following are the comparison points Veyronis must verify against a reachable current repository before adopting them:

- chain-key discovery through ChainInfo
- attestation waiting before proof acquisition
- proof freshness and retry behavior
- receipt-status and source-contract checks
- event/log validation
- replay protection and duplicate-source protection
- batch-size and block-range limits
- capture of live proof and transaction artifacts
- worker/orchestration behavior

## 4. AttestDesk Pattern

**UNVERIFIED:** No current AttestDesk source or live deployment was available in the repository or reachable from this environment. The relevant audit questions are whether verification is performed locally, through a Creditcoin ASC, or both; whether `verifyAndEmit` is used; and where receipt, event, replay, and business-state checks occur.

## 5. Spark Pattern

**UNVERIFIED:** No current Spark source or live deployment was available. Relevant comparison points are multiple evidence types, dual proofs, balance/solvency evidence, batch processing, attestation waits, and live evidence artifacts.

## 6. Veyronis Gap Matrix

| Capability | Veyronis | Official SDK | CrossCredit | AttestDesk | Spark | Priority |
|---|---|---|---|---|---|---|
| live CC3 verification | UNVERIFIED | SDK support | UNVERIFIED | UNVERIFIED | UNVERIFIED | P0 |
| chain-key discovery | Implemented | Implemented | UNVERIFIED | UNVERIFIED | UNVERIFIED | P0 |
| attestation waiting | API available, not used in service | Implemented | UNVERIFIED | UNVERIFIED | UNVERIFIED | P0 |
| fresh proof acquisition | Implemented | Implemented | UNVERIFIED | UNVERIFIED | UNVERIFIED | P0 |
| proof validation | Implemented through BlockProver | Implemented | UNVERIFIED | UNVERIFIED | UNVERIFIED | P0 |
| BlockProver verify | Implemented | Implemented | UNVERIFIED | UNVERIFIED | UNVERIFIED | P0 |
| verifyAndEmit | Not used | Implemented | UNVERIFIED | UNVERIFIED | UNVERIFIED | P1 |
| transaction decoding | Implemented | Encoding support | UNVERIFIED | UNVERIFIED | UNVERIFIED | P0 |
| receipt-success validation | Implemented | Not business logic | UNVERIFIED | UNVERIFIED | UNVERIFIED | P0 |
| source-contract validation | Implemented | Not business logic | UNVERIFIED | UNVERIFIED | UNVERIFIED | P0 |
| sender/recipient/amount/calldata validation | Implemented | Not business logic | UNVERIFIED | UNVERIFIED | UNVERIFIED | P0 |
| block-window validation | Implemented | Attestation APIs | UNVERIFIED | UNVERIFIED | UNVERIFIED | P0 |
| agreement binding | Implemented | Not applicable | UNVERIFIED | UNVERIFIED | UNVERIFIED | P0 |
| evidence commitment | Implemented | Not applicable | UNVERIFIED | UNVERIFIED | UNVERIFIED | P0 |
| replay/duplicate-source protection | Implemented in registry and verifier | Not applicable | UNVERIFIED | UNVERIFIED | UNVERIFIED | P0 |
| batch proofs | SDK available, Veyronis does not use | Implemented | UNVERIFIED | UNVERIFIED | UNVERIFIED | P2 |
| proof freshness handling | No explicit retry/re-fetch orchestration | SDK wait API | UNVERIFIED | UNVERIFIED | UNVERIFIED | P1 |
| live evidence artifacts | Not available | Examples only | UNVERIFIED | UNVERIFIED | UNVERIFIED | P0 |
| negative-path demonstration | Local tests | SDK tests | UNVERIFIED | UNVERIFIED | UNVERIFIED | P1 |
| on-chain business logic | Registry/escrow only; policy is backend | Precompile only | UNVERIFIED | UNVERIFIED | UNVERIFIED | P2 |
| frontend evidence visualization | No evidence submission UI/API | Not applicable | UNVERIFIED | UNVERIFIED | UNVERIFIED | P1 |

## Security Model Check

Attestcoin/BlockProver establishes:

> This transaction is cryptographically included in the attested source chain.

Veyronis establishes:

> This verified transaction satisfies the immutable agreement policy.

The existing tests demonstrate the separation:

- Correct transaction: proof valid -> policy pass -> claim can be submitted.
- Wrong amount: proof valid -> policy failure -> claim rejected.
- Wrong recipient: proof valid -> policy failure -> claim rejected.
- Wrong sender: proof valid -> policy failure -> claim rejected.
- Failed source transaction: inclusion may be valid -> receipt-status check fails -> claim rejected.
- Replay: same claim/source evidence -> registry replay protection -> rejected.

Relevant tests:

- `backend/src/attestcoin/attestcoin-service.test.ts`
- `backend/src/attestcoin/source-transaction-interpreter.test.ts`
- `backend/src/attestcoin/attestcoin-verifier.test.ts`
- `contracts/test/EvidenceClaimRegistry.t.sol`

## Current Conclusion

The immediate gap is not another architecture: it is live infrastructure reachability and evidence capture. Veyronis already has the semantic policy boundary and registry protections. The next proof point should be a read-only CC3 diagnostic followed by one real `verifySingle` call once RPC, ChainInfo, chain key, and Proof Builder availability are confirmed.
