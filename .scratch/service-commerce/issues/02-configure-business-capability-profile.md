# 02 - Configure Business Capability Profile

**What to build:** Give each Store a server-owned Service Commerce capability and readiness profile for requests, quotes, bookings, payments, pickup, delivery and allowed channels.

**Blocked by:** 01 - Define Service Commerce Boundary And Compatibility Contract.

**Status:** complete on 2026-08-10

**Approval:** Original and revised Progressive Catalog scope owner-approved on
2026-08-09.

- [x] Define shared Zod contracts for capability configuration, readiness blockers, operational access and customer-visible availability.
- [x] Keep Tenant/Store/role/exception authorization at API and repository boundaries; clients render the returned access state.
- [x] Support per-Store activation while retaining Tenant-level administration and billing ownership.
- [x] Add a server-owned Catalog adoption mode of `progressive` or
  `inventory_managed`, with separate readiness for private draft capture,
  public activation, tracked stock and procure-to-order policy.
- [x] Make incomplete setup, restricted vertical policy, unavailable provider and disabled capability distinct states with actionable recovery.
- [x] Add a Midday-style setup surface with server prefetch/hydration, URL-owned safe scope, focused forms, exact invalidation and explicit loading/error/empty states.
- [x] Audit every activation/configuration change with actor, Store, previous/current value and reason.
- [x] Test owners/admins/operators, ordinary staff, personal exceptional access where applicable, disabled Stores and cross-Tenant/Store attempts.
- [x] Update Brain feature, API permission/contract and database docs for any approved schema/API changes.

**Evidence:** 21 focused package/repository/setup-state tests passed with 69
assertions; package, DB, API and dashboard typechecks plus Prisma generation
passed. A guarded `.env.local` Neon integration passed 1 test/23 assertions for
concurrent initial profile creation and revision-guarded activation, typed
loser conflicts, audit and cross-Tenant/Store rejection. Repository tests also
prove scoped profile-policy restriction, provider outage, suspended-profile
activation blocking and active-profile invariant enforcement.
Desktop/tablet/mobile Portless QA exercised the
real setup save, exact refetch-before-success and confirmed activation; the
four profile/query tRPC calls returned 200 and the exact synthetic fixture was
removed atomically. `bun db:push` synchronized Neon non-destructively after
`bun db:migrate` refused the existing broad ledger drift without reset. No
local Docker/PostgreSQL or production database/provider operation was used.
The repository-wide test gate recorded 461 pass, 22 opt-in integration skips
and five failures in unrelated in-progress mobile navigation and Retail Ops
test fakes; the three failing files reproduce independently and no Ticket 02
source participates in those failures.
