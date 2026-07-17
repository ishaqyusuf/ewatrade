# Wayfinder: Product And Service Catalog Items

## Destination

Produce a ready-for-agent specification for replacing store-level business templates and dry-cleaning-specific runtime behavior with one neutral catalog in which every sellable item is explicitly a `PRODUCT` or `SERVICE`. Both item kinds have prices; product items participate in inventory, while service items never create, reserve, deduct, transfer, or reconcile stock.

The route is clear when the specification covers the domain model, durable schema, migration of existing product and dry-cleaning data, order and payment behavior, generic service operations, API and UI changes across dashboard and mobile, public flows, authorization, rollout, and externally observable test seams.

## Notes

- Planning only. This Wayfinder must produce reviewed decisions and a publishable specification, not implement the migration.
- Store/tenant identity remains the authorization, billing, and data-isolation boundary. It is not classified as Product or Service.
- The merchant chooses the item kind while creating a catalog item. A store may contain product items, service items, or both.
- Both product and service items have merchant-defined prices and may have priced variants.
- Product items are stock-managed in the current scope. Service items are categorically non-stock and must be rejected by every inventory mutation boundary.
- Dry cleaning is an example service category. No schema, API, permission, navigation, report, or runtime branch should use a dry-cleaning business key.
- Existing dry-cleaning capabilities must be generalized rather than discarded: priced service items, service orders/jobs, due work, evidence, status history, public requests, tracking, notification intents, and operational reporting.
- Existing Product, ProductVariant, OrderItem, InventoryItem, InventoryMovement, staff stock wallet, share-link, offline sync, and closeout behavior must remain correct during migration.
- The previous business-template/capability-matrix proposal is superseded by this item-level model if the resulting specification is approved.
- Relevant Brain sources include `.brain/features/business-type-onboarding-dry-cleaning.md`, `.brain/database/schema.md`, `.brain/database/relationships.md`, `.brain/database/migrations.md`, `.brain/api/endpoints.md`, `.brain/api/contracts.md`, `.brain/api/permissions.md`, and `.brain/plans/2026-07-17-feature-business-template-capability-gating-and-service-architecture.md`.

## Tickets

- [ ] [Lock the neutral store and sellable-item domain](issues/01-lock-neutral-store-and-sellable-item-domain.md)
- [ ] [Design the durable catalog schema and legacy-data migration](issues/02-design-durable-catalog-schema-and-legacy-data-migration.md)
- [ ] [Define product inventory invariants](issues/03-define-product-inventory-invariants.md)
- [ ] [Define the generic service-item and service-job lifecycle](issues/04-define-generic-service-item-and-service-job-lifecycle.md)
- [ ] [Unify orders and payments for product and service lines](issues/05-unify-orders-and-payments-for-product-and-service-lines.md)
- [ ] [Replace template and dry-cleaning contracts with generic item and service contracts](issues/06-replace-template-and-dry-cleaning-contracts.md)
- [ ] [Design onboarding, item creation, and navigation across clients](issues/07-design-onboarding-item-creation-and-navigation.md)
- [ ] [Scope public service flows, reports, notifications, and offline behavior](issues/08-scope-public-service-flows-reports-notifications-and-offline.md)
- [ ] [Define rollout, reconciliation, test seams, and documentation](issues/09-define-rollout-reconciliation-test-seams-and-documentation.md)

## Decisions so far

No Wayfinder tickets have been resolved yet. The standing product direction is recorded in Notes and will be validated through the reviewed proposed-answer comments.

## Not yet specified

- Whether the durable entity should be named `CatalogItem`, `Item`, or remain `Product` with a broader meaning during a compatibility period.
- Whether product and service variants share one table or use kind-specific detail tables behind a common catalog item.
- Whether every service sale automatically creates a service job or whether service items can opt out of fulfillment tracking.
- The minimal generic service-job status lifecycle and which fulfillment fields belong in v1.
- Whether a single commercial order can contain both product and service lines and how fulfilment state is represented when it does.
- How existing dry-cleaning metadata records are backfilled into relational catalog, order/job, event, evidence, link, request, and notification records.
- Whether public product share links and service-request links converge on shared infrastructure while retaining distinct customer flows.
- Which service operations require offline support in the first migration release.
- Exact API procedure names, compatibility aliases, route transitions, database rollout stages, and removal timing for legacy metadata.

## Out of scope

- Business-template presets, a runtime business-type gate, or a store capability matrix.
- Dry-cleaning-, laundry-, tailoring-, salon-, repair-, or other industry-specific runtime models.
- Appointment scheduling, staff calendars, resource booking, recurring services, subscriptions to services, or time-slot capacity management.
- Digital-product licensing or a third item kind.
- Full configurable workflow builders or arbitrary merchant-defined service state machines.
- Provider-native SMS, WhatsApp, payment, or media-storage integrations unless an existing adapter already satisfies the generic contract.
- Rebuilding the existing stock ledger, tenant membership system, subscription system, or customer identity foundation.
- Implementing schema, API, dashboard, mobile, storefront, migration, or rollout changes inside this Wayfinder.
