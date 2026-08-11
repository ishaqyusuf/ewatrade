# 08 - Extract Shared Pickup And Delivery Fulfilment

**What to build:** Extract reusable pickup and delivery eligibility, preparation, assignment, progress, proof and recovery behind a source/vertical policy seam while preserving Pharmacy Commerce behavior.

**Blocked by:** 02 - Configure Business Capability Profile; 03 - Establish
Customer Request Interoperability Contract; 06 - Reuse Quote Payment And Order
Conversion; 11 - Enforce Vertical And Jurisdiction Eligibility.

**Status:** complete (2026-08-11)

**Approval:** Original scope and revised dependency order owner-approved on
2026-08-09.

- [x] Define shared fulfilment commands/projections for pickup and delivery with explicit Tenant, Store, Order and source context.
- [x] Keep Store-configured fixed zones, manual fee review, eligibility, promise and unavailable behavior reusable across eligible verticals.
- [x] Make fulfilment selection revise the current Quote before payment when fee, promise or eligibility changes.
- [x] Enforce paid/eligible/prepared/ready/authorized gates at repository boundaries; vertical policy may add stricter release checks.
- [x] Preserve row-locked idempotent pickup handoff and delivery transition/recovery semantics, including failure, reschedule, reassignment, cancellation and proof.
- [x] Keep addresses encrypted/redacted and public/customer notifications allowlisted.
- [x] Split the oversized prescription acceptance file into shared run-owned fixture helpers plus focused pickup, fixed-delivery, manual-delivery and Service migration specs.
- [x] Centralize the model-owned atomic QA teardown boundary so new fulfilment relations do not require scattered delete changes.
- [x] Run the current Pharmacy Neon pickup/delivery matrix unchanged before enabling another source.

## Completion Evidence

- `@ewatrade/service-commerce` owns strict pickup/delivery commands, safe
  operational projections, transition/zone/gate rules and the actor-aware
  adapter contract. The projection exposes status, revision, preparation,
  proof presence, allowlisted recovery code and state-derived next operations;
  it never exposes an address, proof value, courier detail or private reason.
- `@ewatrade/db` resolves exact accepted-Quote Tenant/Store/Order/source facts,
  revises fulfilment before payment, and applies shared gates inside the same
  transaction as Pharmacy's stricter role/policy commands. Pickup preparation,
  exception and handoff plus delivery preparation, assignment and transition
  serialize on their authoritative rows. Replay ids are payload-bound.
- The protected `serviceCommerce` router exposes exact-source detail, pickup
  and delivery procedures through the explicit Prescription compatibility
  adapter; another source cannot enter that adapter accidentally.
- Acceptance is split into the centralized run-owned fixture, pickup,
  fixed-delivery, manual-delivery and Service-request migration specs. The
  canonical verified `.env.local` Neon matrix passed **8 tests / 242
  assertions / 0 failures**, including fresh concurrent preparation and
  assignment, recovery and replay. Atomic cleanup completed. No local database,
  Docker, external courier or production operation was used.
- Final Ticket 08 spec and Midday/standards reviews passed. No Prisma schema or
  browser surface changed in this ticket, so no migration or new visual QA was
  required.
