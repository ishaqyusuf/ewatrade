# 06 - Reuse Quote Payment And Order Conversion

**What to build:** Make the existing immutable Commerce Quote, Commercial Order, payment and refund seams reusable by eligible request sources without duplicating prescription or service implementations.

**Blocked by:** 03 - Establish Customer Request Interoperability Contract; 03A —
Grow The Private Catalog From Requests And Quotes.

**Status:** approved; blocked by Ticket 03A

**Approval:** Original and revised Progressive Catalog Quote/Order scope
owner-approved on 2026-08-09; selectable Offer Option amendment approved on
2026-08-10.

- [ ] Accept typed source refs and source-owned eligibility/release facts while keeping monetary/version truth in Commerce.
- [ ] Preserve immutable Quote versions, current-version capabilities, expiry, exact totals, Offering snapshots and fulfilment promises.
- [ ] Support immutable mutually exclusive Offer Options within a Quote version.
  Each option owns its exact lines, availability/fulfilment facts and total;
  unselected alternatives are not additive Quote lines and never contribute to
  the payable amount.
- [ ] Make option selection an explicit, idempotent, current-version/expiry-
  guarded command that revalidates availability. Concurrent different choices
  resolve to one selection or a typed stale/conflict recovery, and only the
  selected option can reach acceptance, Order, reservation or payment.
- [ ] Preserve existing simple Quotes as one default payable option during
  expand-contract migration and reconcile the current `alternative` line
  outcome so it cannot accidentally charge every displayed alternative.
- [ ] Make fresh concurrent and replayed acceptance resolve to one Order/work/reservation graph or a typed conflict.
- [ ] Keep hosted checkout preparation separate from verified callback/payment ledger mutation; navigation never establishes payment.
- [ ] Preserve idempotent mismatch, failure, callback replay, cancellation and Tenant/Store-scoped refund behavior.
- [ ] Project only customer-safe Quote/payment/receipt status and keep provider/internal identifiers private.
- [ ] Run compatibility acceptance for existing Service and Pharmacy Quotes before and after extraction.
- [ ] Keep pricing, provider fees, delivery cost, tax and platform charges separately attributable.
- [ ] Allow the current authorized Quote to transact its linked private draft
  Offering while keeping it non-public; tracked stock reserves exactly once,
  while permitted manual/procure-to-order availability creates one explicit
  commitment and no fabricated reservation.
- [ ] Keep Quote price selection separate from confirmed Catalog price
  promotion and preserve historical Quote/Order snapshots after later changes.
