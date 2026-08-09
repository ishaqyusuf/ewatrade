# 08 - Extract Shared Pickup And Delivery Fulfilment

**What to build:** Extract reusable pickup and delivery eligibility, preparation, assignment, progress, proof and recovery behind a source/vertical policy seam while preserving Pharmacy Commerce behavior.

**Blocked by:** 02 - Configure Business Capability Profile; 03 - Establish Customer Request Interoperability Contract; 06 - Reuse Quote Payment And Order Conversion.

**Status:** approved; blocked

**Approval:** Owner-approved on 2026-08-09. Start only after every listed blocker is complete.

- [ ] Define shared fulfilment commands/projections for pickup and delivery with explicit Tenant, Store, Order and source context.
- [ ] Keep Store-configured fixed zones, manual fee review, eligibility, promise and unavailable behavior reusable across eligible verticals.
- [ ] Make fulfilment selection revise the current Quote before payment when fee, promise or eligibility changes.
- [ ] Enforce paid/eligible/prepared/ready/authorized gates at repository boundaries; vertical policy may add stricter release checks.
- [ ] Preserve row-locked idempotent pickup handoff and delivery transition/recovery semantics, including failure, reschedule, reassignment, cancellation and proof.
- [ ] Keep addresses encrypted/redacted and public/customer notifications allowlisted.
- [ ] Split the oversized prescription acceptance file into shared run-owned fixture helpers plus focused pickup, fixed-delivery, manual-delivery and Service migration specs.
- [ ] Centralize the model-owned atomic QA teardown boundary so new fulfilment relations do not require scattered delete changes.
- [ ] Run the current Pharmacy Neon pickup/delivery matrix unchanged before enabling another source.
