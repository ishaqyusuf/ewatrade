# 13 - Deliver Reporting And Complete Cross-Vertical Acceptance

**What to build:** Deliver the shared lifecycle reporting, provider-cost
metering and redacted operational observability seam, then prove the bag-seller
media journey, Pharmacy Commerce and the appointment vertical across the final
Service Commerce migration and acceptance gates.

**Blocked by:** 03A — Grow The Private Catalog From Requests And Quotes; 04 -
Generalize WhatsApp Connection And Location Binding; 04A - Establish Generic
Customer Request Media And Verified Observations; 06 - Reuse Quote Payment
And Order Conversion; 06A — Graduate Progressive Catalog To Managed Inventory;
06B - Enforce Store Quotation Approval And Release; 07 - Add Booking And
Appointment Lifecycle; 08 - Extract Shared Pickup And Delivery Fulfilment; 09 -
Deliver State-Aware Customer Actions And Notifications; 10 - Adapt Pharmacy
Commerce To Service Commerce; 11 - Enforce Vertical And Jurisdiction
Eligibility; 12 - Validate Second Vertical Appointment Business.

**Status:** approved; blocked by Tickets 03A, 04, 04A, 06, 06A, 06B, 07, 08,
09, 10, 11, and 12

**Approval:** Original scope and revised Progressive Catalog batch approved on
2026-08-09; generic Customer Channels/media/Offer Options amendment approved
on 2026-08-10, followed by Store team/Quote release approval as part of the
revised 17-ticket batch.

- [ ] Run the deterministic `.env.local` Neon primary seam for both verticals and web, staff-assisted and WhatsApp origins: connection, request, Quote or booking, payment, and pickup/delivery/service completion.
- [ ] Run a cross-vertical progressive-adoption seam from unmatched demand to
  private draft, suggestion/override, Quote/Order, explicit price promotion,
  managed-inventory graduation and post-graduation sale without history loss or
  invented stock.
- [ ] Run the non-regulated bag-seller seam from WhatsApp image through safe
  generic attachment, human-verified `bag / red / small` observation,
  Catalog match/private draft, mutually exclusive priced Offer Options,
  customer selection, exact Quote/Order/payment and permitted pickup/delivery.
- [ ] Prove web/staff/WhatsApp attachment replay, provider-download retry,
  unsafe/quarantined media, grant expiry/reauthorize, stale observation,
  retention and Tenant/Store isolation independently from Pharmacy's extra
  OCR/clinical-review controls.
- [ ] Prove Store attendant routing and both release modes across web, staff and
  WhatsApp, including approval/rejection/revision, creator self-approval denial,
  membership removal, concurrent decision/replay and pharmacist composition.
- [ ] Build Tenant/Store-scoped cross-vertical reporting projections for channel mix, Requests, Quotes, bookings, payment, pickup, delivery, service completion, reliability and usage from authoritative lifecycle occurrence timestamps.
- [ ] Report Progressive Catalog demand resolved, draft created, existing
  Offering matched, Quote override, explicit reusable-price promotion,
  procure-to-order commitment and managed-inventory graduation from their
  authoritative event times without exposing raw customer/OCR text.
- [ ] Ingest or reconcile Meta delivered-message usage by Connection, market/category and billing owner; keep Meta, BSP/Twilio, number, payment, delivery, tax and EwaTrade amounts separate and represent unavailable external cost as unknown rather than zero.
- [ ] Expose redacted readiness, routing, provider-attempt and job-recovery observability without customer content, credentials, bearer capabilities or provider operation ids.
- [ ] Report only aggregate attachment counts, safe-state/retry outcomes and
  verified-observation conversion facts; never report raw media, object keys,
  customer descriptions or extracted attributes.
- [ ] Add a Midday-style report surface with typed URL Store/date scope, bounded queries, explicit loading/error/empty/retry behavior and role-gated drill-down.
- [ ] Audit sensitive reads and material lifecycle commands with actor, purpose, Tenant, Store, source, authoritative time and result.
- [ ] Prove fresh concurrency, idempotent replay, stale capability rejection, exact totals, reservation/slot exclusivity, failure recovery and atomic run-owned cleanup.
- [ ] Prove independent and central multi-Store WhatsApp routing, same-customer isolation, cross-Tenant fail-closed behavior, rotation/revocation and provider retry.
- [ ] Re-run all completed Prescription Commerce compatibility/Neon evidence and Generic Service request-to-order/work/handoff evidence with no regression.
- [ ] Complete authenticated desktop/mobile and public browser QA for loading, error, empty, forbidden, URL state, global sheets, accessibility, responsive layout and safe retry.
- [ ] Complete performance, contention, rate-limit, security, privacy, audit, retention and cost-attribution checks at approved thresholds.
- [ ] Reconcile any approved schema/backfill on the verified Neon development profile; local Docker/PostgreSQL remains prohibited.
- [ ] Keep live Meta, payment, media/OCR, courier and production database canaries as explicit separately authorized gates.
- [ ] Produce a switch/rollback report and request owner authorization before production rollout or contracting any compatibility model/export.
- [ ] Update Brain architecture, feature, API, permission, database, migration, runbook and task-state docs with exact evidence and remaining blockers.
