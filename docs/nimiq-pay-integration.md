# Nimiq Pay integration (submission demo)

Scope: the Nimiq Pay service fee inside the Veyronis escrow-creation flow. The
existing browser wallet stack (MetaMask, WalletConnect/Reown, RainbowKit,
Wagmi, Ethers) and the Sepolia escrow path are unchanged and never require NIM.

## What was added

- `frontend/app/wallet/nimiq-pay.ts` - host detection, cached Mini App SDK
  `init()`, `listAccounts()`, and a single `sendBasicTransactionWithData()`
  wrapper. The SDK is imported lazily and only after `window.nimiqPay` exists,
  so nothing Nimiq-specific runs in an ordinary desktop browser.
- `frontend/app/wallet/nim-amount.ts` - integer Luna validation and a separate
  display formatter.
- `frontend/app/escrow/nim-service-fee.ts` - the fixed demo fee (1000 Luna =
  0.01 NIM), the deterministic reference payload, the pure gate predicates, and
  helpers that describe the provider return value without interpreting it.
- `frontend/app/escrow/use-nim-service-fee.ts` - the fee state for the wizard.
  It lives above the per-step rendering so a paid fee survives moving between
  wizard steps and the same fee is never requested twice.
- `frontend/app/escrow/nim-service-fee-panel.tsx` - the presentational panel in
  the escrow wizard review step. It renders only inside Nimiq Pay.
- `frontend/app/verification/verification-provider.ts` - provider descriptor
  boundary. Attestcoin on Creditcoin is still the only active provider.

## User flow inside Nimiq Pay

1. The escrow wizard review step shows the Nimiq Pay panel with the amount, the
   recipient field and the reference payload.
2. The user checks the recipient and taps "Authorize Nimiq Pay wallet" (one
   `listAccounts()` call).
3. The user taps "Pay 0.01 NIM service fee" (one
   `sendBasicTransactionWithData()` call) and completes the native Nimiq Pay
   confirmation.
4. On success the panel shows the accepted request, prints the raw provider
   return value and allows the user to continue to deploy and fund the
   agreement.

The review step's "Continue" button is disabled until the fee is paid, and the
panel explains why. While a request is pending both buttons are disabled, which
is what prevents duplicate payment attempts. On rejection or failure the user
stays on the review step with a retry path. Nothing is requested during render:
both host calls require an explicit tap, and neither call triggers the other.

Outside Nimiq Pay the panel renders nothing, the gate is inactive, and the
escrow flow is exactly what it was before.

## Optional configuration

The recipient address is not hard-coded. It is pre-filled from the optional
public variable `NEXT_PUBLIC_NIMIQ_SERVICE_FEE_RECIPIENT` and stays editable in
the panel. When the variable is unset the field is empty and the payment button
stays disabled until a complete `NQ...` address is entered.

## Known limitation (read before claiming verification)

The payment is a **client-side service-gating integration**. Veyronis does not
verify NIM payments:

- No backend route accepts, stores, or reconciles a NIM payment.
- No database column or migration was added.
- The fee blocks progression in the browser session only; it is not stored
  against the agreement and no backend state depends on it.
- The value returned by `sendBasicTransactionWithData()` is displayed and logged
  as an opaque reference. The published SDK documents it as the serialized
  transaction, not as a transaction hash, so Veyronis does not parse it as a
  receipt and does not claim confirmation.
- If the host reports a failure after it has already accepted a request, a retry
  could send the fee twice. Veyronis cannot tell the two cases apart because it
  does not verify NIM payments.

Do not describe this as a verified on-chain NIM payment until the returned value
is confirmed on a device and a backend verification path exists.

## Manual verification status

The SDK surface, the request shape, the gate predicates, the failure handling
and the panel states are covered by unit tests. The integration has not been
exercised end to end against the real Nimiq Pay host, so the exact runtime shape
of the return value and whether the host re-prompts consent on a second
`listAccounts()` call are still unconfirmed.
