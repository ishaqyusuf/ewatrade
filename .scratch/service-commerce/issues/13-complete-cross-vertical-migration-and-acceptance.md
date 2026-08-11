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
immutable report-read audit, bag-seller lifecycle, generic-media matrix,
cross-origin Quote-release matrix and authenticated report browser acceptance
are implemented and verified on the development profile. Final
production-threshold ratification, live-provider, production and
owner-authorized switch/contraction gates remain open; development performance
is measured and the rate boundary is enforced. The authorized read-only
production history census is complete with no backfill candidates, while the
production migration baseline is confirmed drifted and unsafe to apply.

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
- [x] Audit sensitive reads and material lifecycle commands with actor, purpose, Tenant, Store, source, authoritative time and result.
- [x] Prove fresh concurrency, idempotent replay, stale capability rejection, exact totals, reservation/slot exclusivity, failure recovery and atomic run-owned cleanup.
- [x] Prove independent and central multi-Store WhatsApp routing, same-customer isolation, cross-Tenant fail-closed behavior, rotation/revocation and provider retry.
- [x] Re-run all completed Prescription Commerce compatibility/Neon evidence and Generic Service request-to-order/work/handoff evidence with no regression.
- [x] Complete authenticated desktop and compact-mobile Service Commerce report
  acceptance for loaded and empty data, report/detail error and safe retry, safe
  role denial, typed URL detail plus browser Back/Forward state, keyboard access,
  responsive overflow containment and clean healthy-state console. Loading
  semantics remain source-verified and truncation presentation remains
  source/unit-verified rather than synthesized with a 10,000-row browser
  fixture. Reports are authenticated-only; Tickets 03A and 12 retain the
  global-sheet and public-booking browser evidence respectively.
- [ ] Ratify production performance, contention and rate-limit thresholds.
  The bounded development pilot is complete at four concurrent report reads,
  p95 <= 15 seconds, maximum <= 30 seconds and 30 reads per actor/Tenant per
  rolling 60 seconds; security, privacy, audit, retention and cost-attribution
  source checks remain evidenced below.
- [x] Reconcile any approved schema/backfill on the verified Neon development profile; local Docker/PostgreSQL remains prohibited.
- [ ] Keep live Meta, payment, media/OCR, courier and production database canaries as explicit separately authorized gates.
- [ ] Produce a switch/rollback report and request owner authorization before production rollout or contracting any compatibility model/export.
- [x] Update Brain architecture, feature, API, permission, database, migration, runbook and task-state docs with exact evidence and remaining blockers.

## Evidence recorded on 2026-08-11

- The focused reporting contract/repository/API/URL suite passed 31 tests and
  125 assertions. The verified-Neon reporting seam passed 1 test and 19
  assertions with half-open occurrence windows, scoped lifecycle totals,
  explicit known-zero versus unknown cost, immutable usage replay and redacted
  drill-down. Four concurrent reads remained within the 15-second p95 and
  30-second maximum development targets; two concurrent callers at 29 prior
  reads produced exactly one allowed read and one fail-closed `RATE_LIMITED`
  audit. Repository
  authorization now appends safe immutable allowed or
  denied report-read evidence before report queries; the Neon seam verifies
  actor, Tenant/Store, fixed purpose/source domain, kind/section, window and
  result.
- A focused revocation-race regression proves that authority is re-read after
  the Membership lock. A revocation committed before that re-read cannot consume
  the rate budget or pass authorization; the bounded transaction does not claim
  a snapshot-wide lock over subsequent aggregate queries.
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
- The final verified-Neon independent/central multi-Store WhatsApp routing
  matrix passed 1 test and 13 assertions. Its focused routing,
  connection-rotation and provider-retry suites passed 45 tests and 98
  assertions. The unchanged
  Pharmacy compatibility matrix passed 9 tests and 248 assertions, while the
  unchanged Generic Service request-to-Order, appointment-work and
  cross-vertical isolation matrix passed 3 tests and 75 assertions. All
  run-owned fixtures were removed.
- Authenticated report browser acceptance passed against a run-owned Neon
  fixture at 1280x720 and 390x844. The Owner saw the Store-scoped loaded report,
  known-zero delivery and unknown provider costs, plus the two-row aggregate
  cost drill-down; an unused 2045 window rendered the explicit empty state. A
  deliberate API outage produced report and detail errors and both retry
  actions recovered after restart. Cashier direct access redirected safely,
  typed detail state survived open/close and browser Back/Forward, keyboard
  controls remained reachable, healthy desktop/mobile reloads had no console
  errors, and the 390px page had no horizontal overflow while the wide
  drill-down table scrolled internally. Loading semantics are source-verified
  and the 10,000-row truncation warning remains source/unit-verified rather
  than browser-synthesized. The exact Tenant, Store, users, sessions, report
  audits and usage rows were removed and verified at zero.
- Prisma generated seven additive migrations and all seven are reconciled on the
  verified development Neon profile. The report-read artifact was generated
  from migration history using an empty run-owned Neon shadow database that
  was dropped; its source/Store-FK follow-up used and dropped a second empty
  run-owned shadow. The prior schema pushes were recorded as applied and
  `migrate status` reports all 46 migrations current. No local PostgreSQL or production
  database was used.
- A read-only verified-development census found zero completed Orders, zero
  completed Orders missing `completedAt`, and zero legacy completed-sale Quote
  lines. No speculative development backfill was attempted; production history
  still requires its own immutable-evidence reconciliation.
- The source-only release preflight passes without external access: API deploy
  migrations route through the interactive production fingerprint guard; the
  seven reporting migrations have an offline replay-order/destructive-SQL
  contract; and the allowlisted canary preflight returns only redacted
  readiness with `executionAuthorized: false`. Payment, production media,
  safety/OCR, manual courier proof and the live Meta Connection test remain
  separately authorized open gates.
- The compatibility/contraction inventory records exact generic Service,
  Pharmacy, Channels, media, fulfilment, action/notification, reporting and
  booking ownership plus their live readers/writers and rollback paths. It
  explicitly leaves the report-cohort flag, central route selector, scoped
  all-jobs freeze and unified non-WhatsApp provider kill switch as open control
  gaps rather than claiming an executable traffic switch.
- The authorized read-only production preflight used the guarded hosted-Neon
  fingerprint and made no writes. Prisma found three finished migrations, the
  zero-step failed `20260711120000_retail_ops_stock_ledger_foundation` row and
  42 later unapplied migrations. The failure is PostgreSQL `42P01` because
  `Product` is absent; other `0001_init` prerequisites are also absent despite
  that migration being marked applied. The data census found seven
  `CommercialOrder` rows, none with `status = COMPLETED`, and zero legacy
  Service Quotes/versions/lines, so there is no completion timestamp or legacy
  Quote backfill to perform on the observed snapshot. Production migration
  remains blocked pending a separately
  authorized drift-reconciliation plan.
