# Nimiq Pay integration (submission demo)

Scope: the Nimiq Pay service fee inside the Veyronis escrow-creation flow. The
existing browser wallet stack (MetaMask, WalletConnect/Reown, RainbowKit,
Wagmi, Ethers) and the Sepolia escrow path are unchanged.

## What was added

- `frontend/app/wallet/nimiq-pay.ts` - host detection, cached Mini App SDK
  `init()`, `listAccounts()`, and a single `sendBasicTransactionWithData()`
  wrapper. The SDK is imported lazily and only after `window.nimiqPay` exists,
  so nothing Nimiq-specific runs in an ordinary desktop browser.
- `frontend/app/wallet/nim-amount.ts` - integer Luna validation and a separate
  display formatter.
- `frontend/app/escrow/nim-service-fee.ts` - the fixed demo fee (1000 Luna =
  0.01 NIM), the deterministic reference payload, and helpers that describe the
  provider return value without interpreting it.
- `frontend/app/escrow/nim-service-fee-panel.tsx` - the optional fee panel in
  the escrow wizard review step. It renders only inside Nimiq Pay.
- `frontend/app/verification/verification-provider.ts` - provider descriptor
  boundary. Attestcoin on Creditcoin is still the only active provider.

## User flow

1. The escrow wizard review step shows the Nimiq Pay panel only when the app
   runs inside Nimiq Pay.
2. The user checks the recipient Nimiq address and taps
   "Authorize Nimiq Pay wallet" (one `listAccounts()` call).
3. The user taps "Pay 0.01 NIM service fee" (one `sendBasicTransactionWithData()`
   call). Both actions require an explicit tap; neither runs on page load and
   neither is chained from an effect.
4. The panel shows a pending, success, or failure state and prints the raw
   provider return value.

The panel is not required in the browser flow: when the escrow flow runs in a
normal browser, the panel renders nothing and the Sepolia deploy-and-fund path
is unchanged.

## Optional configuration

The recipient address is not hard-coded. It is pre-filled from the optional
public variable `NEXT_PUBLIC_NIMIQ_SERVICE_FEE_RECIPIENT` and stays editable in
the panel. When the variable is unset the field is empty and the payment button
stays disabled until a complete `NQ...` address is entered.

## Known limitation (read before claiming verification)

The payment is a **client-side demo / service-gating integration**. Veyronis does
not verify NIM payments:

- No backend route accepts, stores, or reconciles a NIM payment.
- No database column or migration was added.
- No agreement state, escrow action, or verification step depends on the
  payment.
- The value returned by `sendBasicTransactionWithData()` is displayed and logged
  as an opaque reference. The published SDK documents it as the serialized
  transaction, not as a transaction hash, so Veyronis does not parse it as a
  receipt and does not claim confirmation.

Do not describe this as verified on-chain NIM payment until the returned value
is confirmed on a device and a backend verification path exists.

## Manual verification status

The SDK surface, the request shape, and the failure handling are covered by unit
tests. The integration has not yet been exercised end to end against the real
Nimiq Pay host, so the exact runtime shape of the return value and whether the
host re-prompts consent on a second `listAccounts()` call are still unconfirmed.
