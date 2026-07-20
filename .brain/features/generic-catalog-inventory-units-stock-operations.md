# Generic Catalog, Inventory Units, And Stock Operations

## Status

Implementation, the clean local database cutover and the owner-requested
behavioral testing are complete.

## Sources Of Truth

- Wayfinder: `.scratch/wayfinder-generic-inventory-units/map.md`
- Specification: `.scratch/wayfinder-generic-inventory-units/spec.md`
- Tickets: `.scratch/generic-inventory-units-implementation/issues/`
- Decision: `.brain/decisions/ADR-0013-generic-catalog-inventory-units-and-stock-operations.md`

## Implemented Domain

- A Catalog Item is permanently Product or Service.
- Sellable Variant represents customer options only.
- Sellable Offering owns a commercial choice, pricing policy, currency, Store
  availability and optional Product identifier.
- Product Unit Offering points to one configured Inventory Unit. Service
  Offering categorically has no inventory relation.
- Product unit configurations are versioned as Draft, Current and Superseded.
  One factor-1 Canonical Unit anchors exact direct factors. Shared selling units
  transact against the canonical pool; Packaged Stock keeps separate balances.
- Exact quantities/factors cross API and offline boundaries as decimal strings.
- Stock Balance Sources, Reservations, Operations and Movements are
  authoritative for receipts, opening stock, counts, adjustments, corrections,
  transformations, transfers, custody, closeout, fulfillment and returns.
- Commercial Order lines retain immutable Offering Snapshots including item,
  variant, unit, factor, configuration, price and balance meaning.

## Implemented Experience

- Dashboard and mobile use the same short Product/Service setup, with optional
  advanced option groups, Offerings, selling units, identifiers, prices and
  opening stock.
- Both forms offer the same optional JSON-backed quick-setup library through a
  full-screen searchable picker. Recipes prefill editable units, exact factors,
  stock behavior and generic options without prices, opening stock, IDs, or
  automatic submission. Quantity precision stays hidden; blank/manual Product
  units and divisible recipe units allow two decimal places.
- Dashboard Catalog, Inventory, Orders and Reports follow the Midday workspace
  structure: thin authenticated routes, typed server prefetch/hydration,
  Suspense and route recovery states, URL-backed search/sheet state,
  domain-owned tables, and focused mutation forms with exact invalidation.
- No industry or container name is a runtime type or branch.
- Feed helpers are examples only. Bag is the received canonical balance and
  Half bag, Quarter bag, and Kilogram are separate Packaged Stock balances, so
  stock becomes sellable in those forms only through explicit transformations.
- Dashboard managers can inspect configuration history, create/edit a Draft and
  publish it. Semantic changes with live balances require an explicit Stock
  Transition operation.
- Dashboard Inventory covers reports/history plus receipt, count, adjustment,
  transformation, custody and Store transfer workflows.
- Mobile provides Product/Service setup, mixed Offering orders, receipt/count/
  adjustment/custody, transformation, closeout, reporting and sync/conflict
  review through full-screen workflows.
- Business registration and dashboards use the shared application host;
  business subdomains remain storefront-only.
- Mobile onboarding introduces Catalog, mixed Orders, stock/work tracking and
  sync without choosing an industry template. Owner sign-up progressively
  collects business identity/address/city/phone/currency before account
  identity and OTP/Google authentication.

## Offline And Reporting

- The mobile persisted command queue has a clean schema boundary and discards
  incompatible state; no compatibility reader remains.
- Supported commands are provisional until replay. Replay is idempotent,
  dependency-aware and conflict-visible.
- Reports expose exact entered/canonical quantities, balance/configuration
  context, Commercial Order facts and reconciliation state without silently
  combining incompatible Packaged Stock.

## Clean Cutover

- Removed the old Product/ProductVariant/InventoryItem model, unit templates,
  price-history bridge, stock delivery/movement bridge, staff stock wallets,
  old carts/orders/POS sessions, generated Product share links, customer bridge,
  sync-run bridge, conversion utility, local all-in-one mobile store, fallback
  routers/schemas, industry seeds and obsolete runtime/QA routes.
- Added neutral system Unit Definition seeding for piece, pack, carton, mass,
  volume and length vocabulary.
- Historical migration files remain immutable history. Prisma generated and
  applied `20260719092903_clean_generic_operations_cutover` after the approved
  local development reset; the required local push is in sync and neutral Unit
  Definitions are seeded.

## Behavioral Validation

- A real API-backed mobile session exercised five business models: packaged
  bulk goods, shared-stock apparel, garment-care services, mixed electronics
  product/service work and quote-based professional services.
- Packaged stock was received and explicitly transformed from 50 full packages
  into 100 half packages without silently combining balance sources.
- Shared-stock variants, mixed Product/Service Orders, service-only Orders and
  quote-required Offerings retained their distinct inventory/work behavior.
- Dashboard Catalog, Inventory, Sales, Reports and tenant switching were
  rendered against the same five businesses. Active-tenant propagation now
  applies to shared-host tRPC requests and switching clears stale cached data
  and URL-backed sheets.
- Mobile offline state and cached dashboard data are tenant-scoped. The mobile
  operation sheets keep focused fields above the Android keyboard and remain
  scrollable with bottom insets.
- Dashboard and mobile summaries use flat dividers, practical padding and
  capability-derived Product/Service navigation. No feed, bag or other
  case-study term is a runtime branch.

## Non-Goals

- Compatibility readers, dual writes, legacy data preservation or industry
  templates.
- Binary floating-point stock truth or automatic stock-pool substitution.
- Per-variant unit-configuration overrides.
- Automatic Package decomposition; physical repacking remains an explicit
  Stock Transformation.
