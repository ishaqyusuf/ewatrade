# 06 - Reuse Quote Payment And Order Conversion

**What to build:** Make the existing immutable Commerce Quote, Commercial Order, payment and refund seams reusable by eligible request sources without duplicating prescription or service implementations.

**Blocked by:** 03 - Establish Customer Request Interoperability Contract; 03A —
Grow The Private Catalog From Requests And Quotes.

**Status:** completed on 2026-08-10 and revalidated on 2026-08-11. Shared Offer Option contracts, additive
persistence, runtime issuance, idempotent selection, selected-only acceptance,
legacy compatibility and the private preparation/release transaction are
source-complete. Focused tests, the post-release verified-Neon matrix and
desktop/mobile browser acceptance are green.

**Approval:** Original and revised Progressive Catalog Quote/Order scope
owner-approved on 2026-08-09; selectable Offer Option amendment approved on
2026-08-10.

- [x] Accept typed source refs and source-owned eligibility/release facts while keeping monetary/version truth in Commerce.
- [x] Preserve immutable Quote versions, current-version capabilities, expiry, exact totals, Offering snapshots and fulfilment promises.
- [x] Support immutable mutually exclusive Offer Options within a Quote version.
  Each option owns its exact lines, availability/fulfilment facts and total;
  unselected alternatives are not additive Quote lines and never contribute to
  the payable amount.
- [x] Make option selection an explicit, idempotent, current-version/expiry-
  guarded command that revalidates availability. Concurrent different choices
  resolve to one selection or a typed stale/conflict recovery, and only the
  selected option can reach acceptance, Order, reservation or payment.
- [x] Preserve existing simple Quotes as one default payable option during
  expand-contract migration and reconcile the current `alternative` line
  outcome so it cannot accidentally charge every displayed alternative.
- [x] Leave one server-owned preparation/release seam for Ticket 06B: no public
  token, outbound action or customer acceptance may be created outside the
  authoritative release command, and source `QUOTED` transition/audit/usage
  effects must be callable idempotently from that same transaction.
  Compatibility remains direct-issued until the explicit Store policy lands.
- [x] Make fresh concurrent and replayed acceptance resolve to one Order/work/reservation graph or a typed conflict.
- [x] Keep hosted checkout preparation separate from verified callback/payment ledger mutation; navigation never establishes payment.
- [x] Preserve idempotent mismatch, failure, callback replay, cancellation and Tenant/Store-scoped refund behavior.
- [x] Project only customer-safe Quote/payment/receipt status and keep provider/internal identifiers private.
- [x] Run compatibility acceptance for existing Service and Pharmacy Quotes before and after extraction.
- [x] Keep pricing, provider fees, delivery cost, tax and platform charges separately attributable.
- [x] Allow the current authorized Quote to transact its linked private draft
  Offering while keeping it non-public; tracked stock reserves exactly once,
  while permitted manual/procure-to-order availability creates one explicit
  commitment and no fabricated reservation.
- [x] Keep Quote price selection separate from confirmed Catalog price
  promotion and preserve historical Quote/Order snapshots after later changes.

## Verification Evidence

- Focused Quote, Catalog and Pharmacy request/fulfilment suites: 62 tests, 156
  assertions; API Option schemas: 3 tests, 5 assertions; DB, API and Storefront
  typechecks plus scoped Biome checks pass.
- Post-release `.env.local` Neon acceptance: multi-option Commerce Inquiry,
  generic Service, Pharmacy web/staff/WhatsApp paid-pickup compatibility and a
  pharmacist-selected substitute all pass — 6 tests and 126 assertions — with
  run-owned atomic fixture cleanup.
- Desktop 1440×900 and mobile 390×844 browser acceptance proves alternative
  display, no pre-selection Accept CTA, selected-only payable total, one Order
  acceptance success through the Storefront's typed tRPC boundary, zero mobile
  horizontal overflow and no browser console errors. The temporary browser
  fixture was removed after the run.
- Legacy commercial `alternative` lines remain visible but are excluded from
  payable totals, reservations, Orders and payments; alternative-only legacy
  Quotes fail closed. Pharmacy keeps the clinical substitute attribution while
  emitting the selected substitute as one included commercial line.
- The machine's system resolver intermittently returned `ENOTFOUND` for the
  Neon pooler. Acceptance used a process-local DNS result with the original
  Neon hostname retained for TLS SNI and the canonical local-profile
  attestation; no repository, environment-file, DNS, local-database or
  production-database setting was changed.
