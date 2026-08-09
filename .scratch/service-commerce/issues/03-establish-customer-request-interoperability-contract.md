# 03 - Establish Customer Request Interoperability Contract

**What to build:** Expose the minimum shared source-reference, public projection and command-discovery seam across Generic Service and Prescription Requests while preserving their separate lifecycles and policies.

**Blocked by:** 01 - Define Service Commerce Boundary And Compatibility Contract; 02 - Configure Business Capability Profile.

**Status:** proposed; awaiting owner approval

**Approval gate:** Planning only. Do not implement until the owner explicitly approves this ticket batch.

- [ ] Define an exhaustive source registry for current `service` and `prescription` kinds, exact Product cart/Order commands, and any discovery-approved narrow Commerce inquiry source, with typed adapters owned outside UI components.
- [ ] Return normalized customer-safe summary, current state, Store identity, capability/readiness and allowed commands without flattening private vertical data.
- [ ] Resolve authorization and vertical eligibility before loading or dispatching a source adapter.
- [ ] Fail closed for unsupported source kinds, stale/missing ids, cross-Tenant/Store refs and state/command mismatches.
- [ ] Keep source-specific review, clarification, release and work commands inside their owning packages.
- [ ] Add compatibility tests proving current public tracking, Quote links, management detail and audit attribution remain unchanged.
- [ ] Avoid free-form status strings and repeated vertical switches; use shared exhaustive unions and maps.
- [ ] Document why a universal `CustomerRequest` table remains out of scope.
- [ ] Prove exact Product demand does not create artificial work and clarify/quote-needed Product demand is never mislabeled as Service or Prescription intent.
