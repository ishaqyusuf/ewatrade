## Parent map

[Wayfinder: Product And Service Catalog Items](../map.md)

## Type

research

## Status

open

## Blocked by

- [Design the durable catalog schema and legacy-data migration](02-design-durable-catalog-schema-and-legacy-data-migration.md)
- [Define product inventory invariants](03-define-product-inventory-invariants.md)
- [Define the generic service-item and service-job lifecycle](04-define-generic-service-item-and-service-job-lifecycle.md)
- [Unify orders and payments for product and service lines](05-unify-orders-and-payments-for-product-and-service-lines.md)
- [Replace template and dry-cleaning contracts with generic item and service contracts](06-replace-template-and-dry-cleaning-contracts.md)
- [Design onboarding, item creation, and navigation across clients](07-design-onboarding-item-creation-and-navigation.md)
- [Scope public service flows, reports, notifications, and offline behavior](08-scope-public-service-flows-reports-notifications-and-offline.md)

## Question

What staged rollout, reconciliation evidence, high-level test seams, observability, rollback plan, and Brain documentation updates are required to ship the item-level model safely?

Resolve baseline and parity checks, shadow or dual-read stages, per-store cutover, idempotency, privacy-safe migration reporting, product-regression coverage, service-flow coverage, mixed-order coverage, public-flow coverage, client E2E coverage, and the exact legacy cleanup gate.
