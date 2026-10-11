# Bulk fulfillment — deterministic database acceptance

- Run: `b6d5f252-6004-4fba-a45c-2982e61a59cb`, 11 October 2026.
- Evidence kind: `deterministic-integration`; verdict: **pass within the scope below**.
- Source: `6b2aa609`; isolated Development database, disposable owned fixtures.
- Capability/action: `sales.products.fulfill` v1 / `product_batch_fulfill`.
- Model, provider, prompt version, dashboard build: not applicable.
- Reported model usage/cost: not applicable; infrastructure cost: unknown.
- Result: 1 test, 24 assertions, 188.26 seconds; owned cleanup completed.

## Proven scope

Two reserved Product lines (quantities 1 and 2) share one balance, alongside one
catalog-free packing Service line. No Finance Book is configured in this fixture.

| Assertion | Result |
|---|---|
| Exact combined stock review, 6 → 3 | Pass |
| Changed balance revision refuses stale confirmation | Pass |
| Injected receipt failure rolls back stock, service and command | Pass |
| Confirmation and same-identity replay | Pass |
| Saved stock 3, reserved 0 | Pass |
| Two Product fulfillments, one Service performance, one bulk command, two movements | Pass |
| Order COMPLETED with completedAt | Pass |

Successful decision took 29.36 seconds against the unchanged 30-second transaction
limit. This leaves little latency margin. Nested trace phases must not be summed.
The broad wrapper test title includes other branches that this dedicated run did
not execute; it is not evidence for those branches.

## Evidence and limits

Local log: `artifacts/assistant-operations-web/d02-bulk-database-acceptance-passed.log`.
Assertions: `apps/api/src/assistant/general-bulk-fulfillment.integration-check.ts`.
Screenshots: not applicable to this backend-only run.

This supports backend portions of BF-01, BF-04, BF-06 and BF-07 in the versioned
conversation fixture. It does **not** pass those conversational scenarios: model
resolution, ambiguity, denial, injection, provider outage and repeated chat requests
remain unverified. Dashboard acceptance and financial-cost regression are separate
gates. No mobile or deployment acceptance is claimed.
