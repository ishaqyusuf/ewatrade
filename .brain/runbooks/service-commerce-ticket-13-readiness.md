# Service Commerce Ticket 13 Readiness And Rollback Report

**Reviewed:** 2026-08-11

**Decision:** NOT READY for production switch or compatibility contraction.

## Verified Development Evidence

- Shared report contracts/repository/API/URL behavior: 31 tests, 125
  assertions.
- Verified-Neon reporting lifecycle: 1 test, 19 assertions, with scoped
  half-open occurrence windows, explicit unknown/zero cost and redacted
  drill-down plus persisted allowed report/drill-down audit evidence. Four
  concurrent reads stayed within the 15-second p95 and 30-second maximum
  development targets; two callers contending after 29 reads yielded one
  allowed read and one audited denial.
- Pharmacy-free bag-seller WhatsApp media-to-Order path: 2 tests, 16
  assertions.
- Generic media replay/retry/quarantine/grant/scope matrix: 30 tests, 95
  assertions.
- Quote release: web/staff/WhatsApp attendant-default and approval-required
  paths, rejection/revision, self-approval denial, concurrent replay,
  membership removal and pharmacist composition are covered. The membership
  case is independently executable rather than relying on test order.
- DB, API, dashboard, jobs, communications and shared-contract TypeScript
  checks pass. Seven additive migrations are applied to the verified
  development Neon profile.
- Final verified-Neon independent/central multi-Store WhatsApp routing: 1 test,
  13 assertions. Focused routing/rotation/provider retry: 45 tests, 98
  assertions.
- Unchanged compatibility reruns: Pharmacy 9 tests/248 assertions; Generic
  Service request-to-Order, appointment-work and cross-vertical isolation 3
  tests/75 assertions. All run-owned fixtures were removed.
- Authenticated report browser acceptance passed at 1280x720 and 390x844
  against a run-owned Neon fixture: loaded and empty states, known-zero versus
  unknown costs, aggregate drill-down, report/detail failure and recovered
  retries, Cashier safe redirect, typed URL Back/Forward behavior, keyboard
  reachability, clean healthy-state consoles and page-level overflow
  containment all passed. Loading semantics are source-verified and truncation
  presentation is source/unit-verified rather than browser-synthesized. The
  exact Tenant, Store, users, sessions, report audits and usage rows were
  removed and verified at zero.
- Read-only development-Neon legacy census: zero completed Orders, zero missing
  `completedAt`, and zero legacy completed-sale Quote lines. No backfill was
  warranted or performed.
- Source-only release preflight is fail-closed: API deployment delegates
  migrations through the interactive production target-fingerprint command;
  an offline test locks the seven reporting migrations into replay-safe,
  non-destructive order; and the redacted live-canary preflight performs no
  database, network or provider operation and always reports
  `executionAuthorized: false`.
- The compatibility inventory now names the switch-critical
  canonical/legacy/shared reader-writer boundaries, their retained rollback
  paths and contraction disposition. It also records the controls that do not
  exist: there is no
  report cohort flag, central compatibility route selector, Tenant/Store
  all-jobs freeze or unified payment/media/OCR/courier kill switch.

## Authorized Read-Only Production Preflight

- Target fingerprint:
  `postgresql://ep-spring-mud-an4xc5nl-pooler.c-6.us-east-1.aws.neon.tech/neondb#identity=6f198191`.
- Prisma sees 46 migration artifacts: three finished, the unfinished
  `20260711120000_retail_ops_stock_ledger_foundation` row with zero applied
  steps, and 42 later unapplied migrations. The failure is PostgreSQL `42P01`:
  `Product` does not exist.
- Although `0001_init` is marked applied, `Product`, `ProductVariant`,
  `InventoryItem`, `Order`, `OrderItem` and `CashierSession` are absent;
  `Store` is present. This is migration-history/schema drift, not an ordinary
  pending deployment.
- The transactionally read-only census found seven `CommercialOrder` rows,
  zero with `status = COMPLETED`, zero legacy `ServiceQuote`
  rows/versions/lines and zero immutable-history backfill candidates.
  `completedAt` and shared `CommerceQuote` are not installed. No production
  write occurred.

## Open Release Gates

1. Ratify production performance, contention and rate-limit thresholds. The
   development performance targets are measured and the rate boundary is
   enforced; this does not approve a
   production capacity or pricing decision.
2. Complete separately authorized live Meta, payment, private-media/safety/OCR
   and courier canaries plus privacy/retention signoff. The offline preflight
   does not close this gate: dedicated payment, production media/safety/OCR and
   courier canary harnesses remain explicitly unsupported, while Meta still
   needs an approved live Connection test window.
3. Design, review and execute a production migration-ledger/schema-drift
   reconciliation under a separately approved write operation. Do not run
   `migrate deploy` while `0001_init` is marked applied but its foundational
   relations are absent and the stock-ledger migration remains unfinished.

## Switch Conditions

The owner should authorize a production switch only after every open gate has
recorded evidence, the development/production schema reconciliation is clean,
and no report or customer action depends on a compatibility-only writer. Use
`.brain/runbooks/service-commerce-compatibility-inventory.md` to record the
selected cohort, current/target artifacts, observed readers/writers and whether
each rollback is an in-app control or a deployment/provider operation.
Technical readiness does not authorize Pharmacy WhatsApp policy or provider
activation.

## Rollback Conditions And Actions

- **Before production migration:** any failed source test, browser check,
  threshold, policy review or live canary stops the switch. Keep current
  Prescription, Service and reporting entry points unchanged; no data rollback
  is required.
- **After additive migration but before traffic switch:** if reconciliation or
  read validation fails, remove the new report navigation from the release
  cohort and continue writing existing authoritative lifecycles. Keep the
  role-gated, audited historical report read available to authorized managers
  for diagnosis unless a separate security incident requires deployment-level
  API disablement. Retain additive nullable columns and usage rows; do not
  destructively reverse them.
- **After traffic switch:** if scope, privacy, cost, routing or lifecycle parity
  fails, route callers back to the preserved compatibility entry points,
  suspend affected provider dispatch, and reconcile immutable events before
  resuming. Do not delete accepted Quote, Order, payment, booking, media,
  Prescription or audit history.
- **Contraction:** deletion/rename of compatibility models, exports, routes or
  jobs is prohibited until a separate owner-authorized contraction confirms no
  reader/writer, unresolved history or rollback need remains.

## Authorization State

No production switch/contraction authorization is requested by this report
because the listed gates are still open. Reissue this report with exact final
evidence before requesting the owner's decision.
