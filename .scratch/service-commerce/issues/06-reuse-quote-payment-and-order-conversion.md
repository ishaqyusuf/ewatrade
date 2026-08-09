# 06 - Reuse Quote Payment And Order Conversion

**What to build:** Make the existing immutable Commerce Quote, Commercial Order, payment and refund seams reusable by eligible request sources without duplicating prescription or service implementations.

**Blocked by:** 03 - Establish Customer Request Interoperability Contract.

**Status:** proposed; awaiting owner approval

**Approval gate:** Planning only. Do not implement until the owner explicitly approves this ticket batch.

- [ ] Accept typed source refs and source-owned eligibility/release facts while keeping monetary/version truth in Commerce.
- [ ] Preserve immutable Quote versions, current-version capabilities, expiry, exact totals, Offering snapshots and fulfilment promises.
- [ ] Make fresh concurrent and replayed acceptance resolve to one Order/work/reservation graph or a typed conflict.
- [ ] Keep hosted checkout preparation separate from verified callback/payment ledger mutation; navigation never establishes payment.
- [ ] Preserve idempotent mismatch, failure, callback replay, cancellation and Tenant/Store-scoped refund behavior.
- [ ] Project only customer-safe Quote/payment/receipt status and keep provider/internal identifiers private.
- [ ] Run compatibility acceptance for existing Service and Pharmacy Quotes before and after extraction.
- [ ] Keep pricing, provider fees, delivery cost, tax and platform charges separately attributable.
