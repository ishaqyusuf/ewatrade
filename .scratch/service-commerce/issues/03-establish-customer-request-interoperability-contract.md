# 03 - Establish Customer Request Interoperability Contract

**What to build:** Expose the minimum shared source-reference, public projection and command-discovery seam across Generic Service and Prescription Requests while preserving their separate lifecycles and policies.

**Blocked by:** 01 - Define Service Commerce Boundary And Compatibility Contract; 02 - Configure Business Capability Profile.

**Status:** approved; blocked by Tickets 01 and 02

**Approval:** Original and revised Commerce Inquiry scope owner-approved on
2026-08-09.

- [ ] Define an exhaustive source registry for `service`, `prescription` and
  the approved narrow `commerce_inquiry` kind plus exact Product cart/Order
  commands, with typed adapters owned outside UI components.
- [ ] Return normalized customer-safe summary, current state, Store identity, capability/readiness and allowed commands without flattening private vertical data.
- [ ] Resolve authorization and vertical eligibility before loading or dispatching a source adapter.
- [ ] Fail closed for unsupported source kinds, stale/missing ids, cross-Tenant/Store refs and state/command mismatches.
- [ ] Keep source-specific review, clarification, release and work commands inside their owning packages.
- [ ] Add compatibility tests proving current public tracking, Quote links, management detail and audit attribution remain unchanged.
- [ ] Avoid free-form status strings and repeated vertical switches; use shared exhaustive unions and maps.
- [ ] Document why a universal `CustomerRequest` table remains out of scope.
- [ ] Implement Commerce Inquiry only for Product demand requiring
  identification, availability confirmation or a Quote; prove exact Product
  demand does not create artificial work and no Product intent is mislabeled
  as Service or Prescription.
- [ ] Give Commerce Inquiry the explicit `received`, `needs_clarification`,
  `ready_to_quote`, `quoted`, `converted`, `declined`, `withdrawn` and `expired`
  lifecycle; Catalog resolution cannot create an Order or mark it converted.
