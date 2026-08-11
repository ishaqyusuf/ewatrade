# Service Commerce Ticket 13 Readiness And Rollback Report

**Reviewed:** 2026-08-11

**Decision:** NOT READY for production switch or compatibility contraction.

## Verified Development Evidence

- Shared report contracts/repository/API/URL behavior: 23 tests, 102
  assertions.
- Verified-Neon reporting lifecycle: 1 test, 10 assertions, with scoped
  half-open occurrence windows, explicit unknown/zero cost and redacted
  drill-down.
- Pharmacy-free bag-seller WhatsApp media-to-Order path: 2 tests, 16
  assertions.
- Generic media replay/retry/quarantine/grant/scope matrix: 30 tests, 95
  assertions.
- Quote release: web/staff/WhatsApp attendant-default and approval-required
  paths, rejection/revision, self-approval denial, concurrent replay,
  membership removal and pharmacist composition are covered. The membership
  case is independently executable rather than relying on test order.
- DB, API, dashboard, jobs, communications and shared-contract TypeScript
  checks pass. Four additive migrations are applied to the verified
  development Neon profile.

## Open Release Gates

1. Add immutable actor/purpose/Tenant/Store/result audit for report and
   drill-down reads.
2. Run authenticated desktop and compact-mobile browser QA for the new report
   route, including forbidden, empty, error/retry, URL navigation, truncation,
   keyboard and responsive states.
3. Approve numeric performance, contention and rate-limit thresholds, then run
   the corresponding bounded report/provider/security tests.
4. Run the final independent/central multi-Store WhatsApp routing matrix and
   the full unchanged Pharmacy/Generic Service compatibility regression.
5. Reconcile legacy completed-sale timestamps only where immutable source
   events prove them; otherwise retain the explicit unknown classification.
6. Complete separately authorized live Meta, payment, private-media/safety/OCR
   and courier canaries plus privacy/retention signoff.
7. Reconcile and apply the production migration baseline under an approved
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
