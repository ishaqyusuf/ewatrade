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
  16 assertions, including replay-safe persistence and one atomic worker claim
  under a concurrent duplicate. Focused routing/signature/rotation/provider
  retry: 48 tests, 108 assertions.
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
- The current offline `meta_whatsapp` probe is `BLOCKED`: the named production
  environment does not supply the five required Meta/webhook/encryption/Redis
  key names, and no production Tenant/Store/Connection, consented test recipient
  or neutral-template evidence was attested. The command returned only safe
  reason codes and performed no database, network or provider operation.
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
- A bounded drift-inventory command is now source-verified offline. It requires
  a separately provisioned least-privilege production credential, a new
  inventory-specific authorization and the approved target fingerprint; it
  has not been run against production. See
  `.brain/runbooks/service-commerce-production-drift-inventory.md`.

## Open Release Gates

1. Ratify production performance, contention and rate-limit thresholds. The
   development performance targets are measured and the rate boundary is
   enforced; this does not approve a
   production capacity or pricing decision.
2. Complete separately authorized live Meta, payment, private-media/safety/OCR
   and courier canaries plus privacy/retention signoff. The offline preflight
   does not close this gate: Meta is currently blocked on its named environment
   facts and approved scoped evidence/window; dedicated payment, production
   media/safety/OCR and courier canary harnesses remain explicitly unsupported.
3. Design, review and execute a production migration-ledger/schema-drift
   reconciliation under a separately approved write operation. Do not run
   `migrate deploy` while `0001_init` is marked applied but its foundational
   relations are absent and the stock-ledger migration remains unfinished. A
   future drift-inventory execution also requires its own read-only credential
   and authorization; it cannot authorize the reconciliation write.

## Owner Authorization Record

**Status:** pending. This section is the bounded decision record; a generic
"authorized" response cannot be reused across rows because each row has a
different external effect, operator and rollback boundary.

| Gate | Required owner/provider record | Current state |
| --- | --- | --- |
| Production report thresholds | Approve or revise p95 15 seconds, maximum 30 seconds and 30 reads per actor/Tenant per rolling 60 seconds; name capacity owner and effective release | Development measurement and rate-boundary evidence only |
| Meta live window | Tenant, Store, Connection, consented test recipient, approved operator/window, current template/category/Nigeria rate-card evidence and rollback owner | Offline probe blocked; no provider call authorized |
| Pharmacy Paystack canary | Payment owner, Pharmacy policy/legal approval, test account/credential, non-customer mailbox, amount/currency, callback window and refund authority | Dedicated canary execution remains unsupported and unapproved |
| Generic media and Pharmacy media/OCR | Selected storage/scanner/OCR providers, processing region, DPA/privacy/retention approvals, credentials, benign test asset and deletion evidence | Production adapters and provider decisions absent |
| Manual courier proof | Approved SOP, designated test Order/courier/address, proof expectations and incident/rollback owner | Manual provider exists; operating proof unapproved |
| Production drift inventory | Dedicated least-privilege read-only credential, exact target fingerprint and inventory-specific authorization | Required environment facts absent; command not executed |
| Production reconciliation write | Reviewed ledger/schema repair plan, backup/PITR checkpoint, operator/window, exact write authority and stop/rollback criteria | Current baseline is drifted and unsafe for `migrate deploy` |
| Traffic switch | Selected cohort, deployment reference, monitoring owner, provider/job controls and rollback trigger | Not authorized; compatibility readers/writers retained |
| Compatibility contraction | Separate post-observation approval proving no reader, writer, job or rollback depends on each named artifact | Prohibited before successful switch observation |

Every authorization must identify its row and evidence reference. Provider,
database-write, traffic-switch and contraction authority are not transitive.
An approved read-only preflight cannot authorize a write or provider call, and
a successful switch cannot authorize later deletion.

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
