# F01 canonical collection commands — source packet 2 handoff

12 October 2026. Implementation-agent packet on the coordinator-applied
`20261012160840_collections_payouts` schema, **ready for coordinator review**.
Commands are not registered with any router, tool or job (privacy inventory and
acceptance first). Overall 13/45 unchanged.

## What exists now (`packages/db/src/queries/collection-intents.ts`)

- `openCollectionIntentInTransaction` — exact-retry replay by
  `(tenantId, clientIntentId)` (different details → `IDEMPOTENCY_MISMATCH`);
  locks the order row; builds the shared source snapshot (effective paid amount,
  cancelled/closed status, customer); applies `decideOpenCollection` (partial
  0 < amount ≤ balance for staff with `canAcceptPayment`, customer links in full,
  one open link per order, 10 min–72 h, order currency); creates the intent with
  a stable `col_<32 hex>` reference bound to Tenant + client identity.
- `cancelCollectionIntentInTransaction` — open links only, under the order lock,
  compare-and-set; status EXPIRED with `cancelledAt/By`. A late provider success
  is still kept and settles only if it fits.
- `recordCollectionProviderEvent[InTransaction]` — **own transaction**: stores the
  event before any decision; replay by `(provider, providerEventId)` with payload
  hash; an unknown reference is kept as `REJECTED` / `unknown_reference` evidence;
  a missing currency stays null.
- `applyCollectionProviderEvent[InTransaction]` — separate transaction under the
  order lock, rereads after locking; `decideProviderSettlement`:
  settle → canonical `recordCommercialOrderPaymentInTransaction`
  (`clientPaymentId: collection:<eventId>`, actor `payment-provider`, reference =
  link reference) + intent PAID + event APPLIED; failure → intent FAILED; duplicate
  or late failure → IGNORED; otherwise a `CollectionHold` row (currency `UNKNOWN`
  when the provider omitted it, so it can only be refunded) + event HELD.
- **Manual receipt guard** in the canonical payment core
  (`commercial-payments.ts`): a new non-refund, non-credit payment is refused
  while a CREATED/PENDING unexpired link exists for the order; only that link's
  own settlement passes, via an internal option the router cannot set. Exact
  payment retries still replay first.
- Shared rules moved to `@ewatrade/utils/collection-intent` (new export) so the
  database package uses the same implementation; `@ewatrade/payments` re-exports
  it (coordinator probes unchanged).

## Not yet

- Hold resolution commands (provider refund outbox / customer credit entry) and
  their reviewed assistant action.
- Moving the prescription webhook onto these commands.
- Router/assistant/F02 payment-link capability and UI; privacy inventory for the
  new tables.

## Deployment note

Every new manual payment now reads `CollectionIntent`, so this code must ship
with or after the `collections_payouts` migration in each environment.

## Owned paths

- `packages/db/src/queries/collection-intents.ts`, `.test.ts`, `.integration.test.ts` (new)
- `packages/db/src/queries/commercial-payments.ts` (guard + option)
- `packages/db/src/queries/prescription-payments.test.ts` (fake gains `collectionIntent`)
- `packages/db/src/queries/index.ts` (export)
- `packages/utils/src/collection-intent.ts` (moved rules), `packages/utils/package.json` (export)
- `packages/payments/src/collection-intent.ts` (re-export)
- `packages/assistant/impact/2026-10-12-f01-collection-commands.json`

## Checks

Run here: `collection-intents.test.ts` 1 pass; `bun test packages/payments` 30
pass; `prescription-payments.test.ts` 12 pass / 1 failure that also fails at HEAD
(`commercialOrderPayment.findMany` fake gap, unrelated); full `packages/db/src`
2964 pass / 18 failures, none involving the new table (all present before);
`order-visibility.test.ts` 26 pass; scoped db types clean.

**Connected run** (12 Oct 2026, requested by the owner): a plain
`RUN_DATABASE_INTEGRATION_TESTS=1 bun test …` is correctly refused by the
verified-profile guard. The new launcher `scripts/qa-collection-intents.mjs`
(same pattern as `qa-account-privacy-record-retention.mjs`: explicit `.env.local`
Development profile, Production excluded, guard flags set) ran it:

```bash
node scripts/qa-collection-intents.mjs
```

Result: **2 pass, 13 assertions, 37.4 s**; one transaction per case, always
rolled back, no provider calls.

Cases: partial link + exact replay + changed-details refusal + second open link
refused + manual payment refused while open + provider success settles once
(replayed event and re-apply are no-ops) + manual remainder allowed after; cancel →
manual full payment → late provider success HELD with `source_already_settled`
and an unresolved hold row; unknown reference kept as REJECTED evidence.

## Owner direction — Paystack paused (12 Oct 2026)

The owner paused all further Paystack implementation (F02 link sending, provider
refunds, F04 dispatch, F05, prescription webhook migration). Held money is
refunded **manually** (cash, bank transfer, POS, other) by someone with
money-back authority, or kept as the order customer's credit.
`decideHeldResolution` now takes `{ kind: "manual_refund", method }` or
`{ kind: "customer_credit" }` and returns `effect: "manual_refund"` with the
method; the provider-refund effect is gone. `bun test packages/payments` 30 pass.
The applied schema's `CollectionHold.refundCommandId` (provider refund outbox) is
now unused; the coordinator may drop or keep it. No hold-resolution command is
built while the provider path is paused.
