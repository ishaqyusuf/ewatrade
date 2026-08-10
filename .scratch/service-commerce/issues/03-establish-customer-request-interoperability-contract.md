# 03 - Establish Customer Request Interoperability Contract

**What to build:** Expose the minimum shared source-reference, public projection and command-discovery seam across Generic Service and Prescription Requests while preserving their separate lifecycles and policies.

**Blocked by:** 01 - Define Service Commerce Boundary And Compatibility Contract; 02 - Configure Business Capability Profile.

**Status:** complete

**Approval:** Original and revised Commerce Inquiry scope owner-approved on
2026-08-09.

- [x] Define an exhaustive source registry for `service`, `prescription` and
  the approved narrow `commerce_inquiry` kind plus exact Product cart/Order
  commands, with typed adapters owned outside UI components.
- [x] Return normalized customer-safe summary, current state, Store identity, capability/readiness and allowed commands without flattening private vertical data.
- [x] Resolve authorization and vertical eligibility before loading or dispatching a source adapter.
- [x] Fail closed for unsupported source kinds, stale/missing ids, cross-Tenant/Store refs and state/command mismatches.
- [x] Keep source-specific review, clarification, release and work commands inside their owning packages.
- [x] Add compatibility tests proving current public tracking, Quote links, management detail and audit attribution remain unchanged.
- [x] Avoid free-form status strings and repeated vertical switches; use shared exhaustive unions and maps.
- [x] Document why a universal `CustomerRequest` table remains out of scope.
- [x] Implement Commerce Inquiry only for Product demand requiring
  identification, availability confirmation or a Quote; prove exact Product
  demand does not create artificial work and no Product intent is mislabeled
  as Service or Prescription.
- [x] Give Commerce Inquiry the explicit `received`, `needs_clarification`,
  `ready_to_quote`, `quoted`, `converted`, `declined`, `withdrawn` and `expired`
  lifecycle; Catalog resolution cannot create an Order or mark it converted.

## Evidence

- `@ewatrade/service-commerce` owns strict source, normalized lifecycle,
  customer-safe projection and exact Product-vs-Inquiry demand contracts.
- `service-commerce-sources.ts` owns one exhaustive, post-authorization loader
  registry and selects only status from Prescription Requests.
- `commerce-inquiries.ts` owns the scoped idempotent Inquiry lifecycle and
  ordered Product-demand lines plus accepted-Quote conversion;
  `commerce-quotes.ts` now handles all source types exhaustively and requires
  every Inquiry Quote line to reference one current scoped Inquiry line.
- Inquiry Quote authorization executes inside the write transaction; identical
  issuance replays rotate a digest-only secondary token while retaining the
  original token and avoiding duplicate lifecycle effects. A quoted Inquiry
  rejects a different Quote identity while retaining immutable revisions under
  the existing Quote. Payable Product lines capture their inventory snapshot
  server-side and forward it to accepted Order reservation.
- 57 focused package/DB compatibility tests pass with 172 assertions; DB and
  API typechecks and targeted Biome pass. The verified `.env.local` Neon schema
  is in sync, and the opt-in Inquiry lifecycle acceptance passes with 22
  assertions and removes its run-owned fixture.
