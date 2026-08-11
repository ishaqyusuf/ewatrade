# 13 - Deliver Reporting And Complete Cross-Vertical Acceptance

**What to build:** Deliver the shared lifecycle reporting, provider-cost
metering and redacted operational observability seam, then prove the bag-seller
media journey, Pharmacy Commerce and the appointment vertical across the final
Service Commerce migration and acceptance gates.

**Dependencies satisfied for source work:** 03A — Grow The Private Catalog From Requests And Quotes; 04 -
Generalize WhatsApp Connection And Location Binding; 04A - Establish Generic
Customer Request Media And Verified Observations; 06 - Reuse Quote Payment
And Order Conversion; 06A — Graduate Progressive Catalog To Managed Inventory;
06B - Enforce Store Quotation Approval And Release; 07 - Add Booking And
Appointment Lifecycle; 08 - Extract Shared Pickup And Delivery Fulfilment; 09 -
Deliver State-Aware Customer Actions And Notifications; 10 - Adapt Pharmacy
Commerce To Service Commerce; 11 - Enforce Vertical And Jurisdiction
Eligibility; 12 - Validate Second Vertical Appointment Business.

**Status:** in progress on 2026-08-11. The shared reporting/cost source,
bag-seller lifecycle, generic-media matrix and cross-origin Quote-release matrix
are implemented and verified on the development profile. Final browser,
non-functional threshold, routing-regression, live-provider, production and
owner-authorized switch/contraction gates remain open.

**Approval:** Original scope and revised Progressive Catalog batch approved on
2026-08-09; generic Customer Channels/media/Offer Options amendment approved
on 2026-08-10, followed by Store team/Quote release approval as part of the
revised 17-ticket batch.

- [x] Run the deterministic `.env.local` Neon primary seam for both verticals and web, staff-assisted and WhatsApp origins: connection, request, Quote or booking, payment, and pickup/delivery/service completion.
- [x] Run a cross-vertical progressive-adoption seam from unmatched demand to
  private draft, suggestion/override, Quote/Order, explicit price promotion,
  managed-inventory graduation and post-graduation sale without history loss or
  invented stock.
- [x] Run the non-regulated bag-seller seam from WhatsApp image through safe
  generic attachment, human-verified `bag / red / small` observation,
  Catalog match/private draft, mutually exclusive priced Offer Options,
  customer selection, exact Quote/Order/payment and permitted pickup/delivery.
- [x] Prove web/staff/WhatsApp attachment replay, provider-download retry,
  unsafe/quarantined media, grant expiry/reauthorize, stale observation,
  retention and Tenant/Store isolation independently from Pharmacy's extra
  OCR/clinical-review controls.
- [x] Prove Store attendant routing and both release modes across web, staff and
  WhatsApp, including approval/rejection/revision, creator self-approval denial,
  membership removal, concurrent decision/replay and pharmacist composition.
- [x] Build Tenant/Store-scoped cross-vertical reporting projections for channel mix, Requests, Quotes, bookings, payment, pickup, delivery, service completion, reliability and usage from authoritative lifecycle occurrence timestamps.
- [x] Report Progressive Catalog demand resolved, draft created, existing
  Offering matched, Quote override, explicit reusable-price promotion,
  procure-to-order commitment and managed-inventory graduation from their
  authoritative event times without exposing raw customer/OCR text.
- [x] Ingest or reconcile Meta delivered-message usage by Connection, market/category and billing owner; keep Meta, BSP/Twilio, number, payment, delivery, tax and EwaTrade amounts separate and represent unavailable external cost as unknown rather than zero.
- [x] Expose redacted readiness, routing, provider-attempt and job-recovery observability without customer content, credentials, bearer capabilities or provider operation ids.
- [x] Report only aggregate attachment counts, safe-state/retry outcomes and
  verified-observation conversion facts; never report raw media, object keys,
  customer descriptions or extracted attributes.
- [x] Add a Midday-style report surface with typed URL Store/date scope, bounded queries, explicit loading/error/empty/retry behavior and role-gated drill-down.
- [ ] Audit sensitive reads and material lifecycle commands with actor, purpose, Tenant, Store, source, authoritative time and result.
- [x] Prove fresh concurrency, idempotent replay, stale capability rejection, exact totals, reservation/slot exclusivity, failure recovery and atomic run-owned cleanup.
- [ ] Prove independent and central multi-Store WhatsApp routing, same-customer isolation, cross-Tenant fail-closed behavior, rotation/revocation and provider retry.
- [ ] Re-run all completed Prescription Commerce compatibility/Neon evidence and Generic Service request-to-order/work/handoff evidence with no regression.
- [ ] Complete authenticated desktop/mobile and public browser QA for loading, error, empty, forbidden, URL state, global sheets, accessibility, responsive layout and safe retry.
- [ ] Complete performance, contention, rate-limit, security, privacy, audit, retention and cost-attribution checks at approved thresholds.
- [x] Reconcile any approved schema/backfill on the verified Neon development profile; local Docker/PostgreSQL remains prohibited.
- [ ] Keep live Meta, payment, media/OCR, courier and production database canaries as explicit separately authorized gates.
- [ ] Produce a switch/rollback report and request owner authorization before production rollout or contracting any compatibility model/export.
- [x] Update Brain architecture, feature, API, permission, database, migration, runbook and task-state docs with exact evidence and remaining blockers.

## Evidence recorded on 2026-08-11

- The focused reporting contract/repository/API/URL suite passed 23 tests and
  102 assertions. The verified-Neon reporting seam passed 1 test and 10
  assertions with half-open occurrence windows, scoped lifecycle totals,
  explicit known-zero versus unknown cost, immutable usage replay and redacted
  drill-down.
- The Pharmacy-free bag-seller Neon seam passed 2 tests and 16 assertions from
  WhatsApp image intake through safe media, attributed observation, two
  mutually exclusive NGN options, exact selected Order/payment and pickup.
- The Quote release Neon suite passed its web/staff/WhatsApp default and
  approval-required matrices, rejection/revision, concurrent replay and
  pharmacist-composition cases. The corrected membership-removal case passed
  independently with 4 assertions and no test-order dependency.
- The generic-media focused matrix passed 30 tests and 95 assertions. Live
  Meta/object-storage/safety-provider canaries and production retention signoff
  remain separate gates.
- Prisma generated four additive migrations and all four are applied to the
  verified development Neon profile. The repository wrappers `bun db:migrate`
  and `bun db:push` were also attempted but returned Prisma's generic schema
  engine error; guarded `migrate deploy` succeeded and the exact limitation is
  retained in the Brain migration log. No local PostgreSQL or production
  database was used.
