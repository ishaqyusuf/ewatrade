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

## Open Release Gates

1. Ratify production performance, contention and rate-limit thresholds. The
   development performance targets are measured and the rate boundary is
   enforced; this does not approve a
   production capacity or pricing decision.
2. Reconcile production legacy completed-sale timestamps only where immutable
   source events prove them; otherwise retain the explicit unknown
   classification. The development census was empty and required no mutation.
3. Complete separately authorized live Meta, payment, private-media/safety/OCR
   and courier canaries plus privacy/retention signoff.
4. Reconcile and apply the production migration baseline under an approved
   production operation.

## Switch Conditions

The owner should authorize a production switch only after every open gate has
recorded evidence, the development/production schema reconciliation is clean,
and no report or customer action depends on a compatibility-only writer.
Technical readiness does not authorize Pharmacy WhatsApp policy or provider
activation.

## Rollback Conditions And Actions

- **Before production migration:** any failed source test, browser check,
  threshold, policy review or live canary stops the switch. Keep current
  Prescription, Service and reporting entry points unchanged; no data rollback
  is required.
- **After additive migration but before traffic switch:** if reconciliation or
  read validation fails, disable the new report navigation/API procedures and
  continue writing existing authoritative lifecycles. Retain additive nullable
  columns and usage rows for diagnosis; do not destructively reverse them.
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
