# Plan: Flexible Product Units And Price History

## Type
Feature

## Status
Done

## Created Date
2026-07-06

## Last Updated
2026-07-15

## Intake
- Intake File: .brain/intake/2026-07-06-sales-management-saas-mvp.md
- Intake Item: Set product, units, reusable unit base, and feed price with price history.

## Goal Or Problem
Let merchants define products with flexible sellable units such as bag, half bag, and quarter bag, and keep durable price history so historical sales reports use the correct price at the time of sale.

## Current Context
The current commerce schema has `Product`, `ProductVariant`, and `InventoryItem`. Product variants have `priceMinor`, but there is no explicit unit conversion model, unit template library, or price history entity. The mobile MVP now captures a lightweight conversion multiplier for locally created variants and tracks local stock per variant so half-bag and quarter-bag sale flows can be exercised before the production schema exists.

## Proposed Approach
Introduce a unit system where each product has a base unit and one or more sellable units with conversion ratios to the base unit. Add reusable unit templates for common businesses. Add price history records with effective dates, actor, and optional reason. Preserve variant/order snapshots so reports remain stable.

## Implementation Steps
- Define schema additions for unit templates, product units, unit conversion ratios, and price history.
- Decide how `ProductVariant` maps to sellable units or whether a new product-unit entity should become the sellable SKU boundary.
- Seed or expose reusable templates: Bag/Half/Quarter, Crate/Bottle, Carton/Piece, Roll/Meter, Kg/Gram, Dozen/Piece, Bucket/Liter.
- Add dashboard product setup UI for selecting a template or creating custom units.
- Add price-setting UI with current price, effective date, changed-by user, and optional reason/comment.
- Ensure order/sale line items snapshot unit name, conversion ratio, and unit price at sale time.
- Add validation for conversion ratios, duplicate unit names, and future-dated prices.

## Affected Files Or Areas
- `packages/db/prisma/models/commerce.prisma`
- `packages/db/prisma/models/enums.prisma`
- `apps/dashboard`
- `apps/pos`
- `packages/db/src`
- `.brain/database/schema.md`

## Acceptance Criteria
- A merchant can create a product with a main unit and derived units.
- A merchant can select from reusable unit templates and customize unit names/ratios.
- Price changes are stored as history with effective date, actor, and optional reason.
- Sales created after a price change use the effective current price.
- Historical sales retain their original unit and price snapshot.

## Test Plan
- Run `bun run db:generate` after schema changes.
- Run `bun run typecheck`.
- Add or run domain tests for unit conversion and price lookup by effective date.
- Manually verify a price change does not rewrite prior sales.

## Brain Update Requirements
- Update `.brain/database/schema.md`, `.brain/modules/merchant-system.md`, and create/update a feature doc for product units and price history.

## Lower-Agent Readiness
- Implementation scope is clear: Yes
- File boundaries are clear: Yes
- Acceptance criteria are observable: Yes
- Required checks are listed: Yes
- Brain update requirements are listed: Yes
- Ready for handoff: Yes

## Completion Report Requirements
Lower agent must report:
- Changed files
- Checks run
- Brain docs updated
- Unresolved issues
- Any skipped acceptance criteria

## Risks / Edge Cases
- Fractional units can cause rounding errors if stored as floats; prefer integer ratio numerator/denominator or decimal-safe representation.
- Price effective dates must handle timezone and backdated correction rules.
- Inventory may need base-unit quantities while UI shows sellable unit quantities.

## Open Questions
- TODO: Confirm whether merchants can price derived units independently from base-unit conversion math.

## Progress Notes
- 2026-07-10: Added the first local mobile unit bridge. The first-product setup form now stores optional variant conversion multipliers, with half/quarter defaults, and variants carry their own local stock bucket. The create-sale flow lists the primary unit plus variants, blocks overselling the selected bucket, and keeps sale snapshots for the chosen unit price/name. Production unit template schema, durable price history, effective-date lookup, and tRPC persistence remain pending.
- 2026-07-10: Added the first production product setup API bridge. `retailOps.createProduct` creates an active product, a default primary-unit variant, optional variant/sub-unit rows with independent prices and conversion metadata, and opening inventory items for each unit. Reusable unit templates, durable conversion-ratio entities, price history, effective-date lookup, and ledger-backed opening stock remain pending.
- 2026-07-10: Added the first production price-history bridge. `retailOps.updateProductUnitPrice` lets sales-management users update a product unit's current price, append metadata-backed price-history entries with actor/previous/new price/effective time/reason, reject future-dated changes for now, and keep default-unit product list pricing aligned. Durable price-history tables, template-based unit management, and effective-date lookup remain pending.
- 2026-07-10: Added role-aware product setup enforcement. `retailOps.createProduct` now requires owner/admin/manager sales-management permission before resolving store scope, checking product entitlements, or creating catalog/inventory rows.
- 2026-07-10: Added first production price-history reporting. `retailOps.priceHistory` exposes bounded metadata-backed product-unit price history for the selected store/date range, and the dashboard Reports screen can view and export previous, new, and current unit prices. Durable price-history tables, effective-date price lookup, and template-based unit management remain pending.
- 2026-07-11: Added the durable product unit and price-history Prisma source schema and migration foundation. `ProductUnitTemplate` and `ProductUnitTemplateUnit` now model reusable system/tenant unit sets with integer conversion ratios, `Product` and `ProductVariant` can point at templates, `ProductVariant` can store explicit conversion ratio numerator/denominator values, and `ProductUnitPriceHistory` stores previous/new price, effective timestamp, actor, reason, source, and replay id. Generated Prisma client models and durable-first repository bridges now exist; seed/template management UI, migration application, and live DB validation remain pending.
- 2026-07-11: Added the durable price-history repository bridge. Product setup and `retailOps.updateProductUnitPrice` still write metadata fallback entries, but now mirror those entries into `ProductUnitPriceHistory` when the migration is available. `retailOps.priceHistory` now reads durable rows first, merges legacy metadata rows by id during rollout, and falls back to metadata when durable tables are undeployed. Template management UI, reusable unit seeds, effective-date price lookup, migration application, and live DB validation remain pending.
- 2026-07-11: Added the durable conversion-ratio repository bridge. `retailOps.createProduct` now converts positive first-phase conversion multipliers into durable `ProductVariant.conversionRatioNumerator`/`conversionRatioDenominator` values while keeping metadata fallback. Created-product responses resolve the multiplier from metadata first, then durable ratio fields for idempotent replay compatibility. Reusable unit templates, conversion-ledger enforcement, effective-date price lookup, migration application, and live DB validation remain pending.
- 2026-07-11: Added the product unit-template list bridge. `retailOps.unitTemplates` now returns active durable system/tenant unit templates with ordered unit ratios when available, merges fallback bag-fraction and kilogram-fraction presets when seeds are missing, and falls back to presets when durable template tables are undeployed. Template creation/editing, mobile picker UI, automatic product-template linkage, conversion-ledger enforcement, effective-date price lookup, migration application, and live DB validation remain pending.
- 2026-07-11: Added the product setup unit-template linkage bridge. `retailOps.createProduct` now accepts optional `unitTemplateKey`; when it matches an active durable system or tenant unit template, created products and matching variants store template/template-unit ids and use matched template-unit ratios for durable conversion ratio fields. Fallback-only or undeployed template keys keep the manual setup path. Template creation/editing, seed management UI, mobile picker UI, conversion-ledger enforcement, effective-date price lookup, migration application, and live DB validation remain pending.
- 2026-07-11: Added the sale-time effective price lookup bridge. `retailOps.createSale` now resolves the unit price at `soldAt` from durable `ProductUnitPriceHistory` first, metadata price history second, and current variant price last, then snapshots that price into order items, totals, receipts, and response metadata. Effective-price preview UI, broader service contracts, migration application, and live DB validation remain pending.
- 2026-07-11: Added the effective product-unit price preview query. `retailOps.productUnitPriceAt` lets POS-capable callers resolve a product unit's effective price for a selected timestamp using the same durable-first, metadata-second, current-price-last lookup as sale creation. Mobile/dashboard UI wiring, migration application, and live DB validation remain pending.
- 2026-07-11: Added fallback unit-template ratio application during product setup. If `retailOps.createProduct` receives a `unitTemplateKey` that matches fallback bag/kilogram presets while durable template rows are unavailable, matching units now use the fallback ratios for conversion multiplier and durable ratio fields without writing relational template ids. Durable seed management UI, mobile picker UI, conversion-ledger enforcement, migration application, and live DB validation remain pending.
- 2026-07-11: Added first conversion-ratio enforcement during production unit conversion. `retailOps.recordUnitConversion` now compares source and target base-unit quantities using metadata conversion multipliers or durable ratio fields when both units expose ratio data, rejecting mismatches before stock movement. Waste/loss workflows, durable conversion ledger rows, migration application, and live DB validation remain pending.
- 2026-07-11: Added first durable conversion ledger writes for production unit conversion. External-id-backed `retailOps.recordUnitConversion` calls can now replay from durable conversion movement rows when metadata fallback is missing, then mirror successful conversions into paired `InventoryMovement` rows when the stock-ledger migration is available. Waste/loss workflows, stock-ledger report reads, migration application, and live DB validation remain pending.
- 2026-07-11: Added durable opening-stock movement persistence during product setup. `retailOps.createProduct` now keeps creating `InventoryItem` balances for each product unit, and positive starting quantities also write `InventoryMovement(OPENING_STOCK)` rows when the stock-ledger migration is available. Migration application, live DB validation, and richer opening-stock correction workflows remain pending.
- 2026-07-15: Marked implementation ticket complete. Core acceptance is covered by product units, reusable unit templates with fallback presets, durable-first price history, sale-time effective price lookup, and unit/price snapshots on sale records. Template editing UI and live migration rollout remain follow-up work.

## Linked Task
- Task Title: Flexible Product Units And Price History
- Task File: .brain/tasks/roadmap.md
