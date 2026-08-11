# 07 - Add Booking And Appointment Lifecycle

**What to build:** Add a typed Store-scoped booking capability for Service Commerce, including resources, availability, holds/confirmation, payment policy, reminders, reschedule, cancellation and completion.

**Blocked by:** 02 - Configure Business Capability Profile; 03 - Establish
Customer Request Interoperability Contract; 05 - Deliver Channel-Neutral
Request Intake; 06 - Reuse Quote Payment And Order Conversion; 11 - Enforce
Vertical And Jurisdiction Eligibility.

**Status:** complete on 2026-08-11; production rollout remains separately
authorized

**Approval:** Original scope and revised dependency order owner-approved on
2026-08-09.

- [x] Model bookable Offerings, resources, Store timezone, availability rules, exceptions, duration, lead time and capacity with explicit ownership.
- [x] Represent scheduled, confirmed, arrived, in-service, completed, cancelled and no-show states independently from payment state.
- [x] Make slot hold/confirmation atomic and concurrency-safe so exclusive capacity cannot be double-booked.
- [x] Snapshot booking, deposit/full-payment, cancellation and refund policy at confirmation.
- [x] Support authorized, revision-guarded reschedule/cancel commands with structured reasons and audit history.
- [x] Create provider-neutral confirmation/reminder/change intents and identifier-only jobs that re-authorize at execution.
- [x] Integrate eligible Request, Quote, Order and Service Job relationships without making booking a JSON field or prescription state.
- [x] Add dashboard/public Midday-style loading, error, empty, stale and mobile/accessibility coverage.
- [x] Test timezone/DST boundaries, contention, expiry, replay, cancellation/refund and notification failure recovery.

## Completion Evidence

- Prisma generated and applied `20260811072717_service_commerce_booking_lifecycle`
  and `20260811074755_service_booking_horizon_alignment` through the canonical
  verified `.env.local` Neon workflow. `bun db:migrate` and `bun db:push`
  finished in sync; no local Docker/PostgreSQL, production database, reset or
  hand-authored migration was used.
- The focused contract/repository/API/job/dashboard/storefront matrix passes
  49 tests and 120 assertions. Heap-bounded TypeScript checks pass for Service
  Commerce, DB, API, jobs, dashboard and storefront; scoped Biome/diff checks
  are clean.
- The run-owned Neon lifecycle passes 1 test and 29 assertions across Store
  configuration, resource capacity, real concurrent holds, replay/expiry,
  confirmation snapshots, Request/accepted Quote/Order/Service Job links,
  separate payment reconciliation, reschedule/cancel/refund, provider-neutral
  notifications, capability isolation and DST. Its Tenant/User graph is
  removed atomically.
- Authenticated dashboard configuration and the public slot, hold, confirm,
  cancel and reschedule surfaces pass at 1440px and 390x844 with no application
  console error or horizontal overflow. This is responsive web/mobile-browser
  coverage; Ticket 07 does not add a native `apps/mobile` booking screen.
