# Wayfinder: Catalog Variants, Product Units, And Sellable Offerings

Label: `wayfinder:map`

## Destination

Produce an implementation-ready specification and safe replacement plan for a
shared catalog that separates Sellable Variants, Product Unit Offerings,
Service Offerings, product-configurable inventory units, and Stock
Transformations across database, API, clients, offline sync, reporting, and
clean database setup—removing feed/bag assumptions and the overloaded early
model completely.

## Notes

- Planning only. Resolve decisions and prepare the implementation handoff; do
  not modify product code while working this map.
- Use `/grilling` and `/domain-modeling` for product-language and behavior
  decisions. Keep [EwaTrade Commerce](../../CONTEXT.md) current as terms are
  resolved.
- Standing decision: a Sellable Variant and an Inventory Unit are separate
  concepts. Stock transformations never cross products or sellable variants.
- Standing decision: Sellable Offering is the shared commercial abstraction.
  Product Unit Offerings may attach Inventory Units; Service Offerings may use
  Sellable Variants/options and prices but never attach inventory, canonical
  quantities, balances, or Stock Transformations.
- Standing decision: Unit Definitions are platform or merchant vocabulary;
  every product owns its configured units and exact factors. Core behavior has
  no feed, bag, or industry-specific templates.
- Standing decision: each product has one Canonical Inventory Unit. Every other
  unit has one exact factor to it; arbitrary conversion chains are forbidden.
- Standing decision: divisible units use configured fixed precision;
  indivisible units require whole quantities. Binary floating-point is not an
  inventory representation.
- Standing decision: shared-pool and packaged-stock behavior is configured per
  unit. Alternate Transaction Units do not own balances; Packaged Stock does.
- Standing decision: first-version Stock Transformations are canonically
  balanced, one-source-to-one-target movements within one sellable variant.
  Loss is an explicit adjustment; manufacturing and multi-output recipes are
  outside this effort.
- Standing decision: Unit Price, SKU, barcode, and sale availability belong to
  the Product Unit Offering. Service Offering pricing and availability remain
  commercial but have no quantity factor or stock meaning.
- Standing decision: used unit configurations are immutable and versioned.
  Historical transactions snapshot the unit configuration they used.
- Standing decision: this is an early-stage clean cutover. Existing development
  data is disposable. Do not design legacy backfills, dual writes,
  compatibility aliases, fallback metadata, or phased preservation of the
  overloaded model.
- The current implementation overloads `ProductVariant` as both sellable
  variant and inventory unit, creates `InventoryItem` per variant/unit, stores
  integer conversion ratios on variants/templates, and includes hardcoded
  feed-bag fallback/seed/UI data that this effort must delete rather than
  preserve.
- Reconcile rather than duplicate the completed
  [Wayfinder: Standard Inventory Item Form](../wayfinder-standard-inventory-item-form/map.md).
  Its `ProductVariant` bridge and unit-template conclusions are explicitly open
  to replacement here.
- Coordinate cost-layer and purchase-receipt boundaries with
  [Wayfinder: Retail Ops Inbound Costing And Business Account Switching](../wayfinder-retail-ops-inbound-costing/map.md);
  this effort does not redesign landed-cost accounting.
- Preserve the neutral Product/Service catalog invariant. Both kinds share
  catalog identity, Sellable Variants, Sellable Offerings, pricing, and order
  snapshots. Only Product items participate in units, balances,
  transformations, reservations, or stock reconciliation.
- The sibling
  [Wayfinder: Generic Service Catalog And Work Operations](../wayfinder-generic-service-operations/map.md)
  owns Service Jobs, intake, fulfillment, public requests, evidence,
  notifications, operational reporting, and offline Service workflows.

## Decisions so far

- [Audit The Current Overloaded Product-Unit Bridge](issues/01-audit-current-overloaded-product-unit-bridge.md)
  is resolved.
- [Lock The Generic Catalog, Variant, Offering, And Inventory-Unit Domain](issues/02-lock-generic-catalog-and-inventory-unit-domain.md)
  is resolved.
- [Define Product And Service Offering Invariants](issues/12-define-product-and-service-offering-invariants.md)
  is resolved.
- [Define Exact Quantity, Factor, And Version Invariants](issues/03-define-exact-quantity-factor-and-version-invariants.md)
  is resolved.
- [Define Shared-Pool And Packaged-Stock Accounting](issues/04-define-shared-pool-and-packaged-stock-accounting.md)
  is resolved.
- [Define Product And Service Offering Commercial Semantics](issues/05-define-sellable-unit-commercial-semantics.md)
  is resolved.
- [Prototype Product Units And Service Offerings Configuration](issues/06-prototype-simple-and-advanced-unit-configuration.md)
  is resolved.
- [Design The Durable Schema And Ledger Evolution](issues/07-design-durable-schema-and-ledger-evolution.md)
  is resolved.
- [Define API, Authorization, Offline, And Conflict Contracts](issues/08-define-api-authorization-offline-and-conflict-contracts.md)
  is resolved.
- [Plan Clean Replacement And Old-Model Removal](issues/09-plan-clean-replacement-and-old-model-removal.md)
  is resolved.
- [Define Reporting, Reconciliation, And Audit Semantics](issues/10-define-reporting-reconciliation-and-audit-semantics.md)
  is resolved.
- [Assemble The Implementation Spec, Rollout, And QA Gates](issues/11-assemble-implementation-spec-rollout-and-qa-gates.md)
  is resolved.
- Catalog Items are immutable Product or Service kinds; every item has a
  Sellable Variant, using an implicit default for simple items.
- Products own one current Unit Configuration Version shared by their variants;
  stock balances remain Store- and variant-specific.
- Unit Definitions provide vocabulary only. Inventory Units own Product-specific
  factors, precision, and one exclusive Stock Behavior.
- Quantities and factors use exact decimals, configuration publication proves
  representability, and Stock Movements retain immutable versioned snapshots.
- Unit Configuration Versions follow Draft, Current, and Superseded states;
  semantic changes against existing stock require a Stock Transition.
- Product Unit Offerings select one Balance Source with no fallback. Shared
  pools, Packaged Stock, reservations, receipts, counts, returns, custody,
  adjustments, transformations, transfers, and closeouts remain
  balance-specific and non-negative.
- Product Unit Offerings are sale choices; Service Offerings never acquire
  inventory meaning.
- Unit Prices are independent from Unit Factors, Price Changes affect future
  transactions only, and discounts/taxes remain Commercial Order concerns.
- Fixed catalog prices use one Business Currency in v1. Supplier Packs map
  purchasing vocabulary to existing Inventory Units without becoming sale
  offerings or redefining factors.
- Sellable Offerings have exactly one immutable Product or Service subtype,
  preserve immutable Order-line snapshots, and use fixed or quote-required
  pricing as allowed by that subtype.
- Business catalog identity and pricing are separate from Store offering
  enablement and Store stock balances.
- Commercial Orders may mix Product and Service lines without creating a hybrid
  Catalog Item.
- The clean-cutover audit identifies every current schema, repository, API,
  dashboard, mobile/offline, storefront, seed, test, utility, migration, and
  active Brain surface that must delete or replace the ProductVariant-as-unit
  bridge. No occurrence is classified for compatibility preservation.
- Create Item uses simple Product and Service defaults with progressively
  disclosed Advanced Configuration. Variants, Inventory Units, Sellable
  Offerings, and Balance Sources are visibly separate; advanced Drafts require
  explicit review and activation.
- Product Unit Factors use a single merchant-facing equation and exact
  validation preview. Opening Stock is posted per actual Balance Source.
  Service option matrices configure Sellable Variants and Offerings only.
- The replacement relational model uses exclusive Product/Service and
  Product-Offering/Service-Offering subtypes, normalized variants, versioned
  Product units, explicit Balance Sources, and an immutable Stock Operation
  ledger. Old unit templates, per-unit variants/balances, fallback readers,
  and compatibility fields are removed.
- Catalog, Offering, Inventory, Order, and Service APIs are separated;
  purpose-specific commands use capability authorization, exact strings,
  idempotency, revisions, and typed conflicts. Offline commands are
  provisional and are never silently rebased, repriced, or reinterpreted.
- Cutover is one coordinated destructive replacement: reset disposable
  databases and mobile state, reject old clients, seed neutral vocabulary,
  keep dashboards on the primary host and subdomains for storefronts, and
  retain no bridge, fallback, backfill, alias, or dual write.
- Official reporting remains Balance-Source- and snapshot-specific, with exact
  canonical analytical totals only where compatible. Counts reconcile through
  movements, custody replaces staff wallets, pending work stays provisional,
  and valuation consumes costing snapshots rather than prices or current
  factors.
- The [implementation-ready specification](spec.md) consolidates the complete
  replacement model, work-package order, test seams, acceptance scenarios,
  observability, destructive reset, documentation, and deletion gates.

## Result

All child issues are resolved. The
[Generic Catalog, Offerings, Inventory Units, And Stock Operations specification](spec.md)
is labelled `ready-for-agent`. The route to implementation is clear; runtime
work remains intentionally unstarted.

## Out of scope

- Manufacturing recipes or bills of materials.
- Transformations between different products.
- Multiple-output production, byproducts, or ingredient consumption.
- Lot, batch, serial-number, and expiry tracking.
- Landed-cost and accounting-valuation redesign.
- Automatic industry, feed, bag, or business-type templates.
- Legacy data migration, compatibility aliases, dual-write rollout, or
  preservation of existing development records.
- Service Job lifecycle, work assignment, evidence, public requests, tracking,
  notifications, or operational Service reporting; those belong to the sibling
  Service Operations map.
- Implementing schema, API, dashboard, mobile, migration, or rollout changes
  inside this Wayfinder map.
