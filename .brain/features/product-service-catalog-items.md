# Product And Service Catalog Items

## Purpose

Provide one neutral merchant catalog in which every sellable item is explicitly a Product or Service. Both kinds have prices. Products participate in stock; Services never participate in stock.

## Status

Implemented on 2026-07-18.

## Source Of Truth

- Ready-for-agent specification: `.scratch/wayfinder-catalog-items-product-service/spec.md`
- Wayfinder map: `.scratch/wayfinder-catalog-items-product-service/map.md`
- Architecture decision: `.brain/decisions/ADR-0008-item-level-product-service-catalog.md`

## Approved Product Rules

- Stores are neutral and can contain Product items, Service items, or both.
- The merchant selects Product or Service when creating an item.
- Product and Service items share catalog fields and pricing.
- Product items are stock-managed in the initial two-kind model.
- Service items never create or mutate inventory, reservations, stock movements, stock wallets, reorder state, closeout stock lines, or unit conversions.
- Item kind becomes immutable after operational use.
- Orders may contain Product-only, Service-only, or mixed lines.
- Product lines apply stock effects. Service lines create generic Service Jobs.
- Payment state belongs to the Order. Service progress belongs to the Service Job.
- Dry cleaning is an example service category, not a business type or runtime namespace.
- Authorization remains tenant/store/role/subscription based; item kind validates whether an operation is semantically valid.

## Approved Mobile Direction

- The current Set up Item flow becomes a shared Add Item flow.
- Add Item starts with a Product/Service selector.
- Product reuses the existing price, unit, variant, image, opening-stock, and conversion controls.
- Service uses the shared name, price, variant, and image controls, hides all stock controls, and may collect turnaround and instructions.
- Existing Products migrate automatically and display a Product badge.
- Existing dry-cleaning service items migrate automatically and display a Service badge.
- The sale picker shows availability for Product items and no stock availability for Service items.
- The existing Service Orders surface becomes generic Service Jobs and no longer owns service-item creation.
- Inventory and stock-derived metrics use Product items only.
- Mixed stores can use Inventory and Service Jobs from the same workspace.

## Implemented Model

- The existing `Product` and `ProductVariant` tables remain the compatibility storage for the canonical Catalog Item and its sellable variants.
- `CatalogItemKind` classifies every item as `PRODUCT` or `SERVICE`; existing records backfill to `PRODUCT`.
- `ServiceItemProfile` owns optional turnaround and instructions for Service items.
- Orders snapshot line kind and support Product-only, Service-only, or mixed lines in one atomic, idempotent sale.
- Product lines apply inventory effects. Service lines never inspect stock and create one generic `ServiceJob` per commercial order.
- Service Jobs have relational lines, events, private evidence, assignment, delays, request links, requests, notification intents, cancellation, and reporting.
- Product cancellation records an inventory reversal. Service cancellation records operational history. Refunds remain explicit payment events and reduce net service revenue.
- The legacy metadata migration is bounded, resumable, tenant/store-scoped, idempotent, and omits private values from reports.

## Experience Gating

- Catalog is always available and displays Product/Service badges.
- Sales navigation, dashboard results, and direct routes are available only when the store has a Product item.
- Services navigation and direct routes are available only when the store has a Service item.
- A mixed store sees both operational areas; an empty store sees neither until the first item is added.
- Mobile owner/admin and sales-rep homes use the same item-driven rules. Product-only actions include stock, sessions, and inventory; Service-only actions use Service Jobs and online service-order language.
- Service checkout uses the normal priced-item order flow without stock or cashier-session requirements.

## Enforcement And Compatibility

- Repository transactions, not UI hiding, enforce Product-only stock operations and return stable kind-mismatch errors.
- Historical order lines retain their kind and price snapshots when catalog records change or are archived.
- Product share links remain Product-only. Public service request and tracking links use opaque tokens and expose only approved customer-safe fields.
- Product offline sync remains supported. Generic Service mutations are online-only.
- Business-template and dry-cleaning-specific runtime contracts are removed. Historical migration readers remain only in the explicit migration module.

## Verification

- 190 focused API, database, dashboard, and mobile tests passed.
- Full workspace typecheck passed.
- Product, Service, mixed-sale, stock rejection, cancellation, refund, request, tracking privacy, report, migration, and navigation behavior are covered.
- Dashboard browser QA covered empty, Product-only, Service-only, and mixed navigation, direct route gates, public request/tracking, and service reporting.
- Android QA covered the tailored Service-only home, generic Service Jobs, Service item selection, price/quantity totals, and successful service order creation.
- Prisma migrate and push checks passed; the legacy migration dry-run and apply were idempotent.

## Deferred

- Digital goods or another item kind.
- Non-stock physical products.
- Appointment calendars and resource booking.
- Arbitrary service workflow builders.
- Offline Service Job mutations.
- Provider-native SMS/WhatsApp delivery.
- Durable cloud evidence upload.
