# ADR-0008: Item-Level Product And Service Catalog

## Status

Accepted

Implemented on 2026-07-18.

## Context

Retail Ops previously separated Product Sales and Dry Cleaning / Laundry through store-level business-template metadata. Product operations used relational catalog, inventory, order, stock, share-link, closeout, reporting, and offline models. Dry-cleaning operations used metadata-backed service items and service orders plus dry-cleaning-specific API, UI, navigation, public-link, report, and authorization names.

That split does not match merchants that sell both physical goods and services. It also makes an industry example responsible for runtime architecture. A service such as Shirt Cleaning has a price and order quantity, but it has no stock balance.

An earlier proposal would have kept business templates as onboarding presets and added store capabilities as runtime gates. The owner instead approved a simpler item-level model through the Product And Service Catalog Items Wayfinder.

## Decision

- A `Store` is a neutral operating workspace. It is not classified as Product, Service, Dry Cleaning, Other, or Hybrid.
- Every sellable catalog record has an explicit item kind: `PRODUCT` or `SERVICE`.
- A store may contain either or both item kinds.
- Both kinds have prices and may have priced variants.
- Product items are stock-managed in the initial two-kind model.
- Service items categorically have no inventory balance, reservation, movement, stock wallet, reorder state, closeout stock line, or unit conversion.
- Commercial orders may contain Product lines, Service lines, or both.
- Order lines snapshot item kind, name, variant, quantity, and price.
- Finalizing an order applies Product inventory effects and creates generic Service Jobs for Service lines atomically and idempotently.
- Payment state belongs to the commercial order. Work progress belongs to the Service Job.
- Dry cleaning is a category, preset, example, or sample-data source only. It must not be a runtime schema, API, permission, navigation, or report namespace.
- Tenant/store scope, membership roles, and subscription entitlements remain separate authorization concerns. Item kind validates operation semantics; it does not authorize a user.
- Existing Product and dry-cleaning data move through an expand/backfill/contract migration with an idempotent legacy migration command and parity evidence.

## Consequences

- The existing Product-centered catalog must evolve into a neutral catalog without breaking Product inventory behavior.
- Metadata-backed dry-cleaning service records must migrate into generic relational service records.
- Mobile and dashboard item creation will begin with a Product/Service choice and render kind-specific fields.
- Inventory, opening stock, stock entry, stock wallets, low-stock, closeout, and Product offline replay will filter and enforce Product items only.
- Service-item creation moves into the shared catalog flow; Service Jobs focuses on operational work.
- Existing `dryCleaning*` and business-template contracts become migration-only compatibility surfaces and are removed after client cutover.
- The earlier business-template/capability-matrix plan is superseded.
- Digital goods, non-stock physical products, appointments, configurable workflows, and offline service operations require later decisions.

## Implementation Notes

- The physical catalog tables retain their `Product`/`ProductVariant` names for compatibility while generic API and UI contracts use Catalog Item terminology.
- Item-driven UX capability checks are derived from catalog contents: Product items enable Sales/stock surfaces and Service items enable Services/Service Jobs.
- Two Prisma migrations add the item kind, generic service operations, mixed-order snapshots, assignment, line cancellation, payment events, and Product stock reversal support.
- Legacy template/dry-cleaning runtime contracts were removed after repository-owned clients moved to generic contracts.
