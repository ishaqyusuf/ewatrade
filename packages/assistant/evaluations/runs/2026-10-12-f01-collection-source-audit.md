# F01 collection source audit and contract — source packet handoff

12 October 2026. Implementation-agent packet 1 for F01, **ready for coordinator
review**. Source-only; no database, provider or network call. Not accepted.

## Audit of existing checkout reuse

The only hosted checkout is the pharmacy prescription path:
`packages/payments` (`HostedPaymentProvider`, Paystack + deterministic provider,
`PaystackWebhookAdapter`) and `packages/db/src/queries/prescription-payments.ts`
(`PrescriptionPaymentIntent`, `PrescriptionPaymentProviderEvent`,
`PrescriptionPaymentRefund`). Reusable: provider interface, signed webhook
verification, deterministic provider, stable provider reference, event identity
+ payload hash replay, refund dispatch claim/outbox pattern. Not reusable as-is:
the intent is bound to an accepted prescription quote/customer token, pharmacy
policy checks and the `pay_now` customer action; there is no staff-initiated or
general Commercial Order collection intent.

Defects found by reading (not executed; a connected reproduction needs the
guarded Development profile):

1. **Manual/online double settlement race.** `preparePrescriptionHostedCheckout`
   refuses only a fully `PAID` order and creates the intent for
   `order.totalMinor`, not the balance. Nothing stops a manual payment while the
   intent is `PENDING`. When the signed `charge.success` then arrives,
   `recordCommercialOrderPaymentInTransaction` throws "Payment cannot exceed the
   outstanding balance" (`commercial-payments.ts`, overpayment guard).
2. **Collected money leaves no durable record.** That throw (and the explicit
   `AMOUNT_MISMATCH` path) happens inside the webhook transaction, so the
   `PrescriptionPaymentProviderEvent` row and its `REJECTED` outcome update roll
   back with it. The provider has the customer's money; the app has no event,
   no reconciliation item and the intent stays `PENDING`.
3. **Currency assumed.** `PaystackWebhookAdapter.parse` defaults a missing
   currency to `NGN`.

## Canonical contract delivered (`packages/payments/src/collection-intent.ts`)

Pure decisions for every caller, so one rule set governs all paths:

- `decideOpenCollection` — source must be open and in the actor's Store scope
  (staff) or the same source (customer link); amount must equal the **current
  balance** exactly (v1; partial links need a policy); order currency only; at
  most one open (unexpired `CREATED`/`PENDING`) intent per source; lifetime
  10 min–72 h.
- `decideManualReceipt` — manual receipts are refused while an online intent can
  still be paid; overpayment refused.
- `decideProviderSettlement` — `settle` once; `already_settled` on duplicate
  delivery; `hold_for_reconciliation` for provider/reference mismatch, amount or
  missing/mismatched currency, cancelled source, or a balance already settled
  (the race above); late success after expiry settles if it still fits; failure
  closes only open intents (out-of-order failure after success ignored).

Exported from `@ewatrade/payments`. Not yet called by any command.

## Proposed persistence (not applied — needs coordinated migration)

A general `CollectionIntent` (tenantId, storeId, sourceKind, sourceId,
clientIntentId unique per tenant, provider, providerReference unique,
amountMinor, currencyCode, status `HostedPaymentStatus`, expiresAt,
createdByUserId nullable for customer links, createdAt/paidAt/failedAt/
cancelledAt) and `CollectionProviderEvent` (providerEventId unique, payloadHash,
outcome RECEIVED/APPLIED/HELD/REJECTED, holdReason, intentId). Requirements:

- Persist the provider event and any HELD/REJECTED outcome in its **own**
  transaction before applying settlement, so a refused settlement never erases
  received money.
- `recordCommercialOrderPayment` (manual) must lock the order and call
  `decideManualReceipt` against open intents in the same transaction.
- Prisma model change via `bun db:generate`, then root `bun db:migrate` /
  `bun db:push` on the verified Development profile. Not run here.
- Decide whether `PrescriptionPaymentIntent` migrates onto the general model or
  calls the shared decisions in place (recommended first step: call
  `decideProviderSettlement` in the prescription webhook and persist held events
  outside the settlement transaction).

## Decisions (answered by the owner 12 Oct — see the repair section below)

## Owned paths

- `packages/payments/src/collection-intent.ts`, `collection-intent.test.ts` (new)
- `packages/payments/src/index.ts` (one export line)
- `packages/assistant/impact/2026-10-12-f01-collection-contract.json`
- This report; ignored Brain plan section

## Checks actually run

| Command | Result |
|---|---|
| `bun test packages/payments/src/collection-intent.test.ts` | 5 pass, 25 assertions |
| `bun test packages/payments` | 21 pass, 59 assertions |
| `bunx tsc --noEmit -p packages/payments`, filtered | 0 diagnostics in new files |

No UI, API, schema, permission or runtime change; nothing to screenshot. F02
(payment link + settlement) depends on the persistence decision above.

## Review repairs and owner decisions — 12 October 2026

Owner decisions (local Brain note `.brain/decisions/2026-10-12-collection-payout-and-canary-policy.md`):
partial links allowed; lifetime 10 min–72 h confirmed; held provider money is
refunded **or** kept as customer credit (reviewed choice); links may be created by
anyone who may accept payment for the order.

Repairs for [the coordinator review](2026-10-12-f01-coordinator-review.md):

1. `decideProviderSettlement` now requires the intent's `tenantId`, `sourceKind`
   and `sourceId` to match the supplied source → otherwise
   `hold_for_reconciliation: source_mismatch`. Snapshots gained `tenantId` and
   `sourceKind` on intents and `customerId` on sources.
2. `decideManualReceipt` and `decideOpenCollection` require a positive safe
   integer (`INVALID_AMOUNT` for −1, 0, 0.5, NaN); provider amounts that are not
   positive integers are held as `amount_mismatch`.
3. Invalid `now` → `INVALID_TIME`; invalid `expiresAt` → `INVALID_EXPIRY`, checked
   before the lifetime bounds.

Policy applied: staff `canAcceptPayment` (caller resolves it with the canonical
payment permission) is required to open a link (`FORBIDDEN` otherwise); staff
amounts may be partial (0 < amount ≤ balance); customer links pay the full
balance. New `decideHeldResolution`: `refund` (needs `canRefund`) or
`customer_credit` (needs `canAcceptPayment`, an order customer and the order
currency); refuses already-resolved items.

Checks: `bun test packages/payments/src/collection-intent.test.ts` 6 pass;
`bun test packages/payments` 22 pass / 81 assertions; types clean. Coordinator
probes: wrong source → `source_mismatch`; four invalid manual amounts →
`INVALID_AMOUNT`. The invalid-expiry probe now stops earlier with `FORBIDDEN`
because its staff actor lacks `canAcceptPayment`; with the permission it returns
`INVALID_EXPIRY` (covered by the new test).

Still open for F01 completion: persisted intent/event model (migration needs the
coordinated Development profile), manual receipt integration in
`recordCommercialOrderPayment`, and moving the prescription webhook onto
`decideProviderSettlement` with held events persisted outside the settlement
transaction.

## Second review repairs — 12 October 2026

1. Settlement now also requires the **order's current currency** to equal the
   intent currency (and the event's); otherwise `hold_for_reconciliation:
   currency_mismatch`.
2. `decideHeldResolution` takes the held receipt's original `intentId`,
   `tenantId`, `sourceKind` and `sourceId` and refuses `SOURCE_MISMATCH` unless
   they match the supplied order, for both refund and customer credit.

`bun --env-file=/dev/null artifacts/assistant-operations-parallel/f01-contract-review-probes.ts`
now prints `currency_mismatch` and `SOURCE_MISMATCH` for the two extended probes,
with all earlier controls unchanged. `bun test packages/payments` 30 pass.
