# Veyronis Architecture

## Boundaries

- `contracts`: authoritative custody, lifecycle, roles, dispute decisions, and settlement.
- `backend`: Attestcoin orchestration, chain monitoring, proof construction/verification coordination, API, and persistence adapters.
- `frontend`: wallet-driven escrow and dispute workflows; it reads authoritative state from Creditcoin.
- `packages/shared`: transport schemas and shared domain types only. It must not contain custody logic.
- PostgreSQL (Phase 2): searchable metadata, evidence references, proof job state, and timestamps. It is never authoritative for balances or settlement.

## Communication

The frontend signs participant escrow transactions directly through the user's wallet and submits off-chain metadata to the backend. The backend indexes contract events, stores derived records, monitors a referenced source-chain transaction, waits for its block to be attested, obtains an inclusion proof with `ProofBuilder`, and verifies it through Creditcoin's BlockProver precompile. A narrowly defined verifier contract then records or settles the verified claim according to the escrow's immutable condition mode.

Ordinary backend sessions cannot move escrowed funds. A settlement transaction must be signed by the registry's immutable authorized verifier and must match the escrow's immutable direct-settlement mode. Frontend and backend reconcile their views against contract events and calls.

## Evidence claim boundary

Verified evidence has two deliberately different boundaries. In a dispute, a proof adapter authorized by `EvidenceClaimRegistry` records an advisory claim; the arbitrator still resolves custody. For an external blockchain condition, the registry binds the verified source fact and either settles a blockchain-only agreement or records a hybrid agreement's prerequisite without moving funds. Application-level work evidence never settles automatically.

The claim contains only:

- `escrow`: binds the claim to one deployed custody instance.
- `agreementCommitment`: prevents evidence for a different agreement at the same conceptual workflow from matching.
- `evidencePolicyCommitment`: binds the claim to the immutable agreement-specific policy evaluated by the verifier.
- `evidenceCommitment`: the deterministic normalized objective context; in a dispute it must match the commitment selected when the dispute was opened.
- `evidenceType`: domain separation, such as a source-chain payment rather than delivery metadata.
- `sourceChainKey`: prevents an equivalent-looking transaction on another chain from matching.
- `sourceTransactionHash`: identifies the objective source-chain transaction.
- `subject`: binds the evidence to the buyer or seller it concerns.

No caller-provided timestamp is accepted. Freshness uses only the source block height authenticated by the proof and committed policy bounds. A separate claimant field is unnecessary: the authorized verifier submits the normalized claim, and the subject captures the participant the evidence concerns.

### Deterministic matching

The verified evidence commitment is:

`keccak256(abi.encode(evidencePolicyCommitment, evidenceType, sourceChainKey, sourceTransactionHash, subject))`

The registry recomputes it. For dispute evidence it must equal the escrow's `activeEvidenceCommitment`. For an external condition the escrow must still be funded with no active dispute/refund evidence. The registry separately reads the escrow's agreement commitment, buyer, seller, state, and direct-settlement mode. The claim ID additionally hashes the escrow address and agreement commitment with every normalized claim field. Consequently, changing the escrow, agreement, chain, transaction, type, or subject changes the claim ID or fails the context check.

### Replay protection

Two mappings serve different replay threats:

- `consumedClaims[claimId]` rejects exact resubmission.
- `sourceEvidenceEscrow[sourceEvidenceKey]` binds one normalized source fact to one escrow, preventing the same transaction evidence from being repackaged with another escrow/agreement.

The escrow records at most one `verifiedClaimId`. Dispute claims are accepted only while disputed; condition claims are accepted only while funded and awaiting delivery. Terminal states reject new evidence before any replay mapping changes.

### Authorization

Only the immutable `authorizedVerifier` address in the registry can submit a claim. In Phase 3 this role is represented by test doubles. In the real integration it will be an adapter that succeeds only after Attestcoin proof verification. Buyers, sellers, arbitrators, the backend, and the frontend cannot call the registry successfully unless they are explicitly the configured verifier.

Verifier authorization establishes who may assert that proof verification succeeded. For a blockchain-only agreement, that authorization is also settlement authority after the policy and escrow checks pass. A compromised verifier key can therefore credit the seller with a falsely matching claim; key custody, rotation, and operational controls are critical. For a hybrid agreement, a compromised key can record a false prerequisite but cannot bypass buyer acceptance, and dispute evidence remains advisory to the arbitrator.

## Evidence threat model

| Threat                     | Attacker capability and attack                       | Impact                                       | Mitigation                                                                                                | Layer                                |
| -------------------------- | ---------------------------------------------------- | -------------------------------------------- | --------------------------------------------------------------------------------------------------------- | ------------------------------------ |
| Replayed proof             | Resubmit an accepted normalized proof                | Duplicate influence or repeated processing   | Consumed claim ID and one verified claim per escrow                                                       | On-chain                             |
| Wrong escrow               | Replace the escrow address                           | Evidence affects unrelated custody           | Escrow address is in claim ID; registry reads target escrow context                                       | On-chain                             |
| Wrong agreement            | Supply another agreement commitment                  | Unrelated terms gain evidentiary weight      | Exact comparison with immutable escrow agreement                                                          | On-chain                             |
| Wrong chain                | Reuse equivalent transaction data from another chain | False source context                         | Chain key is inside evidence commitment, source key, and claim ID                                         | On-chain                             |
| Forged claim               | Submit metadata without a valid proof                | False evidence or blockchain-only settlement | Only authorized verifier may submit; Phase 4 adapter must verify Attestcoin proof                         | On-chain plus Phase 4                |
| Unauthorized submission    | Buyer, seller, frontend, or backend calls registry   | Unverified evidence accepted                 | Immutable verifier authorization                                                                          | On-chain                             |
| Malicious backend          | Fabricates status or normalized data                 | Misleading UI or attempted bad submission    | Ordinary backend sessions cannot accept claims or settle; only the configured verifier key can submit     | On-chain                             |
| Malicious frontend         | Displays false status or crafts calls                | User deception or reverted calls             | Wallet-visible transactions and on-chain validation                                                       | On-chain and client UX               |
| Malicious buyer            | Reuses unrelated payment or subject                  | False buyer-favorable evidence               | Active commitment, participant subject, source binding, arbitrator review                                 | On-chain plus human review           |
| Malicious seller           | Reuses unrelated delivery/payment fact               | False seller-favorable evidence              | Same semantic checks and arbitrator review                                                                | On-chain plus human review           |
| Malicious arbitrator       | Ignores evidence or chooses unfair outcome           | Incorrect settlement                         | Explicit known trust assumption; evidence creates audit trail but cannot eliminate subjective arbitration | Governance/off-chain                 |
| Compromised proof provider | Returns fabricated proof material                    | Adapter may attempt false claim              | Phase 4 must verify through Creditcoin precompile, not trust API response                                 | On-chain proof verification          |
| Stale evidence             | Old transaction reused after the agreed window       | Incorrect dispute context                    | Immutable policy commitment and verified inclusive source-block bounds                                    | Verifier plus on-chain commitment    |
| Conflicting evidence       | Multiple valid facts point to different outcomes     | Ambiguous arbitration                        | One active verified claim in Phase 3; conflicts remain visible off-chain for arbitrator review            | On-chain limit plus off-chain review |
| Duplicate evidence         | Same source fact repackaged                          | Multiple claims appear independent           | Global source evidence key binding                                                                        | On-chain                             |
| Post-settlement evidence   | Submit after complete/refunded/cancelled             | Reopen or influence terminal escrow          | Registry and escrow require an active `Disputed` or `AwaitingDelivery` state                              | On-chain                             |
| Consumed claim             | Submit a claim already accepted                      | Replay                                       | `consumedClaims` mapping                                                                                  | On-chain                             |

### Security assumptions and limitations

- The authorized verifier is trusted to report proof verification accurately; production uses the Attestcoin/Creditcoin adapter, but verifier-key compromise remains an operational risk.
- The arbitrator remains a trusted dispute decision-maker. Dispute evidence is advisory and auditable, not an automatic outcome rule.
- A blockchain-only condition intentionally makes the authorized verifier the settlement actor after deterministic checks. A hybrid condition records the prerequisite but retains buyer acceptance.
- The system supports one verified objective claim per escrow. Multi-claim conflict rules are intentionally deferred.
- Freshness is expressed in verified source block heights. Timestamp rules remain unsupported because the current proof does not independently authenticate a source timestamp.
- The source evidence key intentionally treats a normalized source fact as exclusive to one escrow. Agreements that legitimately share one transaction require a future explicit allocation model rather than weakening replay protection.

## Attestcoin trust model

Attestcoin replaces trust in a Veyronis server's statement that a cross-chain event happened. For Ethereum Sepolia (`chainKey 1`), Veyronis identifies the transaction block, waits until Creditcoin has attested the block, generates the transaction inclusion proof, verifies it through the Creditcoin precompile, then constrains the decoded transaction/event to the agreement's expected chain, contract, sender/recipient, asset, amount, and unique evidence identifier.

A valid inclusion proof alone is insufficient: semantic checks prevent a real but unrelated transaction from settling an escrow. Replay protection binds each accepted claim to one escrow and evidence hash. Human evidence, delivery quality, and subjective facts remain arbitrator inputs; Attestcoin proves objective cross-chain facts only.

## Phase 4 verifier adapter

Phase 4 implements the authorized verifier as four replaceable boundaries:

1. `AttestcoinService` uses `@gluwa/usc-sdk@0.18.0` to check the configured chain through `PrecompileChainInfoProvider.getSupportedChainByKey`, request a proof with `ProofBuilder.getProof`, derive its transaction index with `PrecompileBlockProver.computeTransactionIndex`, and cryptographically verify it with `PrecompileBlockProver.verifySingle`.
2. The source transaction interpreter classifies the verified signed transaction as `SOURCE_PAYMENT` evidence and derives the subject from the transaction sender. Future evidence types require their own interpreter rather than trusting a request label.
3. `AttestcoinVerifier` compares chain key, raw-transaction hash, subject, evidence type, escrow address, agreement commitment, state, active evidence commitment, and direct-settlement mode. It reconstructs the commitment with the same `abi.encode` field order and performs replay prechecks.
4. The ethers registry gateway signs `submitVerifiedClaim` for disputes, `submitVerifiedConditionClaim` for blockchain-only settlement, or `submitVerifiedPrerequisiteClaim` for hybrid prerequisite recording. The registry remains authoritative for authorization, replay protection, and final claim acceptance.

The SDK supplies the Creditcoin precompile addresses and ABIs. Version `0.18.0` uses BlockProver `0x0000000000000000000000000000000000000FD2` and ChainInfo `0x0000000000000000000000000000000000000fd3`; Veyronis does not redefine either interface. `verifySingle` is a read-only precompile call. A successful proof-builder HTTP response is never treated as verification.

### Proof lifecycle

1. A request identifies the escrow, agreement commitment, active evidence commitment, evidence type, source chain key, source transaction hash, and expected subject.
2. The adapter confirms that Creditcoin supports the chain key and asks the configured proof builder for the transaction proof.
3. The adapter parses the signed `txBytes`, recomputes its transaction hash and sender, checks proof metadata, and compares the Merkle-derived transaction index.
4. Creditcoin's BlockProver verifies transaction inclusion and attested block continuity.
5. The interpreter derives normalized evidence from the verified transaction.
6. The verifier reads the escrow and requires the exact context, participant, agreement, deterministic evidence commitment, and immutable condition mode.
7. The adapter checks registry replay state for early rejection, then submits the appropriate claim. The registry repeats authoritative semantic and replay checks.
8. Dispute evidence calls only `recordVerifiedEvidence`. A hybrid condition calls `recordVerifiedCondition` and waits for buyer confirmation. A blockchain-only condition calls `settleVerifiedCondition`, which credits the seller without buyer confirmation. The verifier never calls withdrawal, refund, or arbitrator resolution.

### Trust boundaries and failures

- **Cryptographic fact:** the exact signed source transaction bytes were included at the verified source height in a chain continuity proof accepted by Creditcoin's BlockProver precompile.
- **Semantic match:** Veyronis derives the signed transaction sender and checks the requested chain, hash, `SOURCE_PAYMENT` type, escrow participant, agreement, state, condition mode, and commitment.
- **Human decision:** dispute evidence is advisory and hybrid conditions still require buyer acceptance. Attestcoin does not prove delivery quality, intent, contractual satisfaction, or the correct financial outcome.

Failures are returned with stable categories for invalid/generated-but-unverified proofs, unsupported chains, malformed transaction context, chain/hash/subject/type/escrow/agreement/commitment mismatch, non-disputed escrows, replay, provider failure, registry rejection, and missing configuration. External exception details are not returned, so public results contain no endpoint, credential, or private-key material.

The proof builder remains untrusted: it can deny service or return malformed/substituted data, but those responses cannot pass the raw transaction, index, and precompile checks. A compromised verifier key can submit a claim that passes the registry's commitment checks; for blockchain-only agreements that can settle funds, while hybrid and dispute paths retain their respective human decision. Key custody, rotation, and operational authorization remain deployment responsibilities.

### Configuration and testing

Live verification requires `CREDITCOIN_RPC_URL`, `ATTESTCOIN_PROOF_BUILDER_URL`, `SEPOLIA_CHAIN_KEY`, `VEYRONIS_EVIDENCE_REGISTRY_ADDRESS`, and `VEYRONIS_VERIFIER_PRIVATE_KEY`. The RPC and proof-builder URLs come from the selected Creditcoin/Attestcoin environment; the chain key must be confirmed through Creditcoin ChainInfo; the registry address comes from the Veyronis deployment; and the private key belongs to the address configured as the registry's immutable authorized verifier. `SEPOLIA_RPC_URL` is optional for future monitoring and is not trusted or required by the verification path. Unit tests use fakes and require none of these values.

No live endpoint test runs under `npm test`. Live operation additionally requires a funded verifier account for the registry transaction and an already attested source transaction.

## Phase 5 agreement-scoped evidence policy

Each escrow stores an immutable `evidencePolicyCommitment` alongside its agreement commitment. The complete policy remains off-chain for efficient interpretation, but the verifier must reproduce the exact commitment and the registry independently requires it to equal the value stored by the escrow. A backend cannot silently replace recipients, assets, amounts, or freshness bounds after deployment.

The version 1 commitment is:

```text
keccak256(abi.encode(
  uint8 version,
  bytes32 evidenceType,
  uint64 sourceChainKey,
  uint8 assetKind,
  address expectedSourceContract,
  address expectedRecipient,
  address expectedAsset,
  address expectedSender,
  uint8 amountRule,
  uint256 amount,
  uint64 minSourceBlock,
  uint64 maxSourceBlock,
  bytes4 calldataSelector,
  bool requireTransferEvent
))
```

`assetKind` is `0` for native and `1` for ERC-20. `amountRule` is `0` for exact and `1` for minimum. Zero minimum or maximum block values mean an open bound. A zero source contract disables the extra target constraint. Native policies require a zero asset, no transfer event, and use transaction `value`. ERC-20 policies require a nonzero token/source contract, zero native value, and a verified `Transfer(address,address,uint256)` event.

### Verified transaction interpretation

The SDK's `txBytes` is decoded as its ABI-encoded EVM transaction-plus-receipt Merkle leaf. Veyronis reconstructs the signed type 0, 1, or 2 transaction locally, recovers its sender and hash, and exposes the verified target, value, calldata, receipt status, and receipt logs. The proof's authenticated header number becomes `sourceBlockNumber`; unverified RPC receipt or block fields are not mixed into policy evaluation.

Native payment evaluation checks the committed sender, transaction recipient, optional target, amount rule, success status, chain, and block window. ERC-20 evaluation does not use native `value` as token payment evidence. It requires a matching log emitted by the committed token contract with the exact `Transfer` topic, three topics, ABI-decodable amount, committed sender, and committed recipient.

Version 1 calldata support is intentionally narrow. The zero selector disables calldata requirements. The only supported nonzero selector is ERC-20 `transfer(address,uint256)` (`0xa9059cbb`), decoded with a known ABI and checked semantically. Unknown selectors and malformed encodings fail closed. Arbitrary execution and raw string-only calldata matching are not used.

### Freshness and trust boundaries

The inclusive `[minSourceBlock, maxSourceBlock]` window is part of the immutable policy. Evidence outside it is rejected using the verified Attestcoin header height. A zero maximum is open-ended. Source timestamps are not accepted from callers or ordinary RPC responses; policies needing wall-clock deadlines require a future proof format that authenticates source block timestamps.

- **Cryptographic fact:** Creditcoin's BlockProver accepts inclusion of the reconstructed transaction/receipt leaf at the verified source height.
- **Semantic match:** the verifier evaluates chain, sender, target, recipient, asset, amount, calldata, logs, receipt success, and block window against the committed policy.
- **Outcome boundary:** a dispute claim remains advisory to the arbitrator. A blockchain-only claim can settle through the authorized registry path, while a hybrid claim remains a prerequisite for buyer acceptance.

Policy substitution is blocked by the escrow and registry commitment checks. Wrong contracts and event spoofing are blocked by target and log-origin checks. Native/ERC-20 confusion is blocked by distinct amount sources and the ERC-20 zero-native-value rule. Malformed logs and calldata fail closed. Existing claim and source-evidence keys continue to provide exact replay and cross-escrow duplicate protection. A compromised verifier key cannot alter the immutable policy or bypass registry checks, but it can settle a falsely matching blockchain-only claim; verifier key rotation remains a future deployment and governance concern because authorization is immutable.

## Phase 6 agreement creation and deployment

Phase 6 introduces an application workflow without moving contract authority into the application:

```text
Agreement draft -> shared validation -> canonical policy commitment
  -> canonical agreement commitment -> participant review
  -> backend deployment orchestration -> confirmed escrow metadata
```

The shared package owns the version 1 `EvidencePolicy` schema, the Solidity-compatible ABI policy commitment, and typed application-level delivery terms. The base agreement commitment is `keccak256(abi.encode(buyer, seller, arbitrator, requiredAmount, evidencePolicyCommitment, agreementNonce, evidenceRegistry))`. When deliverables are present, a canonical work-evidence subcommitment is hashed with that base commitment into the final agreement commitment. The nonce provides agreement-instance domain separation. The final agreement and policy commitments are shown before confirmation and are constructor parameters of the deployed escrow; they cannot be modified afterwards.

The frontend is a seven-step creation surface: participants, payment, deliverables, evidence requirements, optional blockchain verification, review, and deploy/fund. It accepts public wallet addresses and agreement fields, derives commitment previews locally, and sends only a validated draft to the backend API boundary after the user selects deployment. It never requests, stores, or transmits a private key, seed phrase, verifier credential, or deployment credential. Its review screen explicitly states that work evidence remains advisory, blockchain conditions follow the lifecycle-specific settlement rule, and commitments are immutable.

The backend's `AgreementCreationService` persists `AWAITING_CONFIRMATION`, transitions through `DEPLOYING`, and reports `DEPLOYED` only after an ethers deployment transaction has a successful receipt. It records a sanitized `FAILED` state without fabricating a contract address if confirmation fails. The `EthersEscrowDeployer` receives a dedicated deployer signer, ABI, and bytecode through dependency injection. `DEPLOYER_PRIVATE_KEY` is loaded separately from `VEYRONIS_VERIFIER_PRIVATE_KEY`; the verifier key is never a deployment fallback.

PostgreSQL stores workflow metadata only: commitments, policy JSON, participants, required amount, immutable deliverables and evidence requirements, work-evidence submissions/reviews, deployment transaction/block/address, timestamps, and the application deployment state. It does not store balances, deposited amounts, withdrawals, on-chain escrow state, refunds, disputes, or arbitrator outcomes. The `AgreementRepository` uses parameterized queries, while the in-memory implementations support deterministic tests with no database. The schema migrations are `backend/sql/001_create_agreements.sql` through `backend/sql/003_create_work_evidence.sql`; operating them and wiring a PostgreSQL pool are explicit deployment tasks, not test prerequisites.

## Phase 7: wallet-authenticated agreement dashboard

The dashboard uses a one-time wallet-signature challenge and an HttpOnly signed session cookie. Authentication controls access to participant metadata; it does not authorize a contract operation. The dashboard contract-read layer reads escrow state, withdrawal credit, and emitted events directly from Creditcoin through an RPC provider. Event records are derived display metadata, not database facts. The browser submits any permitted participant action through the connected wallet, while the backend derives the available actions from the authenticated participant role and fresh contract state. `VerifiedEvidenceRecorded` is advisory to dispute review, `VerifiedConditionRecorded` shows a hybrid prerequisite, and `VerifiedConditionSettled` is the only verified-condition event that credits the seller.

The application deployment status is deliberately separate from `VeyronisEscrow.State`. Contract reads and events remain the only authority for financial and settlement state. A backend failure, duplicate metadata attempt, or stale UI cannot create a confirmed escrow record without a successful receipt.

## Escrow and disputes

The prototype uses one escrow instance per agreement. The buyer funds it on Creditcoin. Before funding the buyer may cancel. Once funded, an application or hybrid agreement allows buyer delivery confirmation; a blockchain-only agreement disables that confirmation and settles only through the authorized registry path. Either party can open a dispute, the arbitrator resolves it to exactly one recipient, and a seller-approved refund pays the buyer. Settlement uses pull-style accounting: state and owed balance are updated before the recipient withdraws.

Deadlines remain future work. Arbitrator authority is scoped to an active dispute and cannot extract funds to an arbitrary address.

## Security improvements over the original design

- Boolean dispute outcomes become typed outcomes and constrained recipients.
- Constructor roles are nonzero and buyer, seller, and arbitrator must be distinct.
- Every action has a caller and state guard; terminal states cannot transition.
- Checks-effects-interactions and a reentrancy guard protect withdrawals.
- Funds are accounted once, converted to a withdrawal credit once, and never sent during state mutation.
- Evidence commitments and lifecycle events make decisions auditable.
- Cross-chain evidence must be attested, semantically matched, and replay-protected.
- Phase 2 adds explicit timeouts so funds cannot remain locked indefinitely.

## On-chain versus off-chain

On-chain: roles, agreement commitment, deposited amount, lifecycle, evidence/claim identifiers, accepted verified claims, dispute outcome, withdrawal credits, and settlement events.

Off-chain: descriptions, hosted attachments and their optional content hashes, PII, search indexes, notifications, source RPC polling, raw proof generation, retry state, decoded evidence previews, and API sessions. Work evidence is application-level review evidence. Only the existing cross-chain evidence pipeline creates the cryptographic evidence commitment recorded through `EvidenceClaimRegistry`.

## Minimum viable end-to-end prototype

1. Buyer and seller create an agreement commitment and deploy an escrow.
2. Buyer deposits native CC3 testnet funds.
3. A known event/transaction occurs on Ethereum Sepolia.
4. Backend discovers `chainKey 1`, waits for attestation, builds the proof, and verifies it on CC3.
5. The claim is matched to the escrow's expected event and recorded on-chain.
6. A blockchain-only agreement is credited by the authorized registry path; a hybrid agreement waits for buyer confirmation after the verified prerequisite and application evidence.
7. The credited party explicitly withdraws.
8. Frontend displays proof, dispute, and settlement state from the chain with backend metadata as a convenience layer.

## Phase 1 dependencies

- Contracts: `forge-std` for Foundry tests.
- Backend: `@gluwa/usc-sdk@0.18.0`, `ethers@^6.15`, `zod`, and `dotenv`; Vitest and TypeScript come from the root workspace.
- Frontend: Next.js, React, ethers v6, and Zod. Wallet-specific UI dependencies are deferred until the first wallet workflow is implemented.
- Shared: Zod for runtime-safe transport schemas.

The official SDK exports `PrecompileChainInfoProvider`, `ProofBuilder`, `PrecompileBlockProver`, `RawProofBuilder`, and query builders. Endpoints remain environment-configurable because protocol infrastructure URLs can change.

## Phase 8 transaction execution and reconciliation

Participant lifecycle transactions are prepared and signed only in the connected browser wallet. A transaction hash is not success: the frontend waits for a successful receipt, then requests a fresh backend reconciliation before reporting completion. Wallet rejection, on-chain revert, RPC failure, and reconciliation failure remain distinct UI states.

The agreement reconciliation service reads escrow roles, immutable commitments, required amount, custody state, participant withdrawal credit, and contract events directly from the chain. PostgreSQL agreement values are compared as metadata caches only. A mismatch is returned as `METADATA_STALE`; it does not replace the chain value or silently rewrite historical metadata.

Escrow events and `EvidenceClaimRegistry.VerifiedClaimAccepted` are indexed from the deployment block. Event timestamps are shown only when obtained from the authenticated block header. Dispute evidence remains advisory; only the authorized condition path can settle a blockchain-only escrow, and a hybrid still requires buyer confirmation.

## Phase 9 local full-stack environment

Local development uses deterministic Anvil (`127.0.0.1:8545`, chain ID `31337`) solely as an EVM execution environment. A Foundry local bootstrap deploys `EvidenceClaimRegistry` and writes an ignored address artifact; the existing backend `EthersEscrowDeployer` then deploys each agreement escrow and verifies its immutable metadata after receipt confirmation. PostgreSQL runs locally as metadata-only storage and records reconciliation observations separately.

The local verifier is a deterministic Anvil account used by `LocalMockAttestcoinVerifier` smoke coverage. It directly invokes the registry to test the registry contract boundary and is never a substitute for the configured production Attestcoin verifier. The Sepolia -> Attestcoin -> Creditcoin CC3 -> precompile verification path remains independent.
