# Plan: Stock Intake And Unit Conversion Ledger

## Type
Feature

## Status
In Progress

## Created Date
2026-07-06

## Last Updated
2026-07-11

## Intake
- Intake File: brain/intake/2026-07-06-sales-management-saas-mvp.md
- Intake Item: When feed production is delivered, set bags delivered and add to inventory; some bags can be rebagged into half and quarter.

## Goal Or Problem
Track delivered stock and unit conversions through an auditable inventory ledger so merchants know exactly how much stock exists in each sellable unit and why balances changed.

## Current Context
The current production bridge still writes `InventoryItem` balances and metadata-backed stock operation records, but the Prisma source schema and migration folder now declare the first durable stock-ledger tables. The mobile MVP has a local persisted stock-movement bridge for opening stock, sales, and stock intake, and the production API exposes bounded first-phase balance mutations and stock movement reads for opening stock, stock intake, manual stock adjustment, unit conversion, sale deductions, staff assignment, staff return, and closeout stock adjustment history. Generated Prisma client models and first durable movement write bridges now cover stock intake delivery headers/lines, stock intake movements, unit conversion, stock adjustment/damage/loss, sale deduction, staff wallet assignment/return, and approved closeout adjustment posting. `retailOps.stockMovements` now reads durable `InventoryMovement` rows first and merges legacy metadata/order/session fallbacks during rollout. Migration application and live validation still need to move onto the durable ledger.

## Proposed Approach
Introduce stock delivery and inventory movement records. Store quantities in a base-unit-safe representation while allowing UI balances by sellable unit. Model rebagging as ledger movements that reduce one unit and increase another according to conversion ratios. Keep source, actor, notes, and timestamps for auditability.

## Implementation Steps
- Add schema for stock deliveries/receipts with source, date, received-by user, notes, and line items.
- Add schema for inventory movements with type, product, unit, quantity, actor, source reference, and metadata.
- Add movement types for delivery, conversion-out, conversion-in, assignment, sale, return, damage, loss, and adjustment.
- Implement service/repository logic that updates inventory balances transactionally from ledger movements.
- Build dashboard UI for recording delivered production/supplier stock.
- Build dashboard UI for converting stock between units, including validation against available stock.
- Add audit views for stock delivery and conversion history.

## Affected Files Or Areas
- `packages/db/prisma/models/commerce.prisma`
- `packages/db/src`
- `apps/dashboard`
- `apps/pos`
- `brain/database/schema.md`
- `brain/modules/merchant-system.md`

## Acceptance Criteria
- Admin can record delivered stock and inventory increases accordingly.
- Admin can convert full bags into half/quarter units and balances update correctly.
- Each inventory balance change has a corresponding ledger/audit record.
- Conversion cannot create stock beyond available source quantity.
- Stock delivery and conversion history can be viewed by product and date.

## Test Plan
- Run `bun run db:generate`.
- Run `bun run typecheck`.
- Add or run ledger tests for delivery, conversion, insufficient stock, and rollback on failure.
- Manually verify inventory balance before and after conversion.

## Brain Update Requirements
- Update `brain/database/schema.md`, `brain/modules/merchant-system.md`, and feature docs for inventory movements.

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
- Mixed-unit inventory can drift if updates bypass the ledger.
- Rebagging may have waste/loss that needs explicit accounting.
- Concurrent conversions and sales require transaction isolation.

## Open Questions
- TODO: Confirm whether production delivery and supplier delivery need separate source models in MVP.

## Progress Notes
- 2026-07-10: Added the first local mobile stock movement bridge. First-product setup creates an opening-stock movement, sales append sale movements, and the dashboard can record delivered/restocked quantity through a keyboard-aware stock intake sheet. These records are stored in the local Retail Ops store with pending sync status and are visible in dashboard and sheet movement lists. Full backend ledger schema, unit conversion, transactional inventory services, and tRPC persistence remain pending.
- 2026-07-10: Added local unit conversion/rebagging on top of the mobile stock movement bridge. The dashboard now opens a conversion sheet for products with variants, validates primary stock before conversion, moves quantity out of the primary unit into the selected variant stock bucket, appends paired conversion-out/conversion-in ledger rows, and queues a pending conversion sync event. Full backend conversion transaction rules and audit filters remain pending.
- 2026-07-10: Added a first production product setup bridge that creates opening `InventoryItem` balances while creating product variants. This is not yet a ledger: stock delivery records, inventory movement rows, and conversion-in/conversion-out transactions remain pending.
- 2026-07-10: Added the first production stock intake balance mutation. `retailOps.recordStockIntake` validates a product variant in the selected tenant/store, increments or creates its `InventoryItem` balance, and returns intake metadata with before/after stock. This remains a balance bridge until stock delivery and inventory movement ledger tables exist.
- 2026-07-10: Added the first production unit conversion balance mutation. `retailOps.recordUnitConversion` validates source and target variants in the selected tenant/store, requires both units to belong to the same product, decrements source stock only when enough stock exists, increments or creates target stock, and returns before/after balances. This remains a balance bridge until conversion-out/conversion-in ledger rows exist.
- 2026-07-10: Added first-phase replay idempotency for stock intake and unit conversion. Duplicate tenant/store/type `externalId` submissions return the original stored response without applying another inventory increment, decrement, or conversion. This remains metadata-backed until durable stock movement and idempotency tables exist.
- 2026-07-10: Added role-aware stock mutation enforcement. `retailOps.recordStockIntake` and `retailOps.recordUnitConversion` now require a POS-capable role before resolving store scope or mutating inventory balances.
- 2026-07-10: Added first-phase production stock movement history. `retailOps.stockMovements` reads the bounded store metadata replay records produced by stock intake and unit conversion, normalizes conversion operations into paired conversion-out/conversion-in rows, and lets the dashboard show/export stock movement history by product, unit, movement type, and date range. Durable delivery/conversion ledger tables remain pending.
- 2026-07-10: Added sale deductions to the first-phase stock movement history. `retailOps.stockMovements` now derives outgoing sale movement rows from completed Retail Ops order items, and newly created sales persist before/after stock movement snapshots on order-item metadata when the sale is recorded. This moves sale deductions into the audit view before durable inventory movement tables exist.
- 2026-07-10: Added staff stock assignment and return rows to first-phase stock movement history. `retailOps.stockMovements` now maps metadata-backed staff stock assignment and return records into outgoing/incoming central-stock rows, including staff display names and before/after central inventory quantities. Durable stock wallet and inventory movement tables remain pending.
- 2026-07-11: Added opening-stock rows to first-phase stock movement history. `retailOps.stockMovements` now maps product-unit setup metadata into incoming opening-stock movement rows with 0-to-opening balances, so first product setup is visible in the production audit view before durable inventory movement tables exist.
- 2026-07-11: Added first conversion-ratio enforcement to production unit conversion. `retailOps.recordUnitConversion` now rejects source/target quantities that do not preserve the same base-unit quantity when both units have conversion multipliers or durable conversion ratio fields, before any stock is mutated. Durable conversion ledger rows, waste/loss handling, and audit filters remain pending.
- 2026-07-11: Added closeout stock adjustment rows to first-phase stock movement history. `retailOps.stockMovements` now derives Stock adjustment movements from non-zero closeout inventory variance lines, using expected versus counted quantities as the before/after balance and the closeout attendant as the source context. Durable loss/damage/adjustment ledger rows remain pending.
- 2026-07-11: Added the first production manual stock adjustment balance mutation. `retailOps.recordStockAdjustment` validates a scoped active product variant, supports increase/decrease direction with correction, damage, loss, or found-stock reason metadata, prevents decreases beyond available stock, stores external-id replay responses under `Store.metadata.retailOps.stockOperations`, replays through `stock_adjustment_recorded`, and maps metadata-backed adjustments into `retailOps.stockMovements` as Stock adjustment rows. This remains a balance and metadata bridge until durable loss/damage/adjustment ledger tables exist.
- 2026-07-11: Wired the mobile stock sheet to local manual stock adjustments. The existing Record stock surface now supports Restock and Adjust modes, applies adjustments to primary or variant unit balances, records Stock adjustment movements with reason metadata, and queues `stock_adjustment_recorded` replay events for production sync.
- 2026-07-11: Added the durable stock ledger source-schema and migration foundation. `packages/db/prisma/models/commerce.prisma` now declares `StockDelivery`, `StockDeliveryLine`, and `InventoryMovement`; `packages/db/prisma/models/enums.prisma` now declares delivery status/source plus inventory movement direction/type/source enums; and `packages/db/prisma/migrations/20260711120000_retail_ops_stock_ledger_foundation/migration.sql` creates the matching enums, tables, indexes, and foreign keys. Stock movements can reference delivery lines, products, variants, related variants, inventory items, orders, order items, cashier sessions, actor/staff ids, external replay ids, and conversion group ids. Generated Prisma client models and first durable movement write bridges now exist; migration application, full durable movement coverage, durable report reads, and live DB validation remain pending.
- 2026-07-11: Added the first durable unit-conversion movement bridge. `retailOps.recordUnitConversion` now checks durable `InventoryMovement` conversion rows for external-id replay before mutating balances when metadata fallback is missing, and writes paired `CONVERSION_OUT`/`CONVERSION_IN` rows with `UNIT_CONVERSION` source, related variants, before/after balances, actor, note, happened-at timestamp, and shared movement group id when the stock-ledger migration is available. Stock intake, adjustment, sale, staff wallet, closeout durable movement writes, report reads, waste/loss workflows, migration application, and live DB validation remain pending.
- 2026-07-11: Added the first durable stock adjustment, damage, and loss movement bridge. `retailOps.recordStockAdjustment` now validates that damage/loss reasons decrease stock and found-stock reasons increase stock, checks durable adjustment movement rows for external-id replay when metadata fallback is missing, and writes one durable `InventoryMovement` row for external-id-backed adjustments when the stock-ledger migration is available. Damage/loss rows use dedicated `DAMAGE`/`LOSS` movement types; correction/found-stock rows use `STOCK_ADJUSTMENT`. Stock intake, sale, staff wallet, closeout durable movement writes, report reads, migration application, and live DB validation remain pending.
- 2026-07-11: Added the first durable stock-intake movement bridge. `retailOps.recordStockIntake` now checks durable `InventoryMovement` intake rows for external-id replay before mutating balances when metadata fallback is missing, and writes one inbound `STOCK_INTAKE` row with `STOCK_DELIVERY` source, before/after balances, actor, source metadata, note, happened-at timestamp, inventory item link, and movement group id when the stock-ledger migration is available. Sale, staff wallet, closeout durable movement writes, durable delivery headers/lines, report reads, migration application, and live DB validation remain pending.
- 2026-07-11: Added the first durable sale-deduction movement bridge. `retailOps.createSale` now mirrors completed sale lines into `SALE_DEDUCTION` rows with `SALE` source, order/order-item/session references, actor, source reference, stock-source metadata, and movement group ids when the stock-ledger migration is available. Store-stock rows carry previous/current central on-hand snapshots, while staff-wallet sale rows carry previous/current wallet quantity snapshots. Staff wallet assignment/return, closeout durable movement writes, durable delivery headers/lines, report reads, migration application, and live DB validation remain pending.
- 2026-07-11: Added the first durable staff wallet movement bridge. `retailOps.assignStaffStock` and `retailOps.returnStaffStock` now upsert scoped durable `StaffStockWallet` balances and write `STAFF_ASSIGNMENT`/`STAFF_RETURN` movement rows with central-stock snapshots, wallet snapshots, actor/staff references, notes, external replay ids, and movement group ids when the staff-wallet and stock-ledger migrations are available. Wallet-aware `retailOps.createSale` also updates the durable wallet balance while writing its sale-deduction movement. Closeout durable movement writes, durable delivery headers/lines, report reads, migration application, and live DB validation remain pending.
- 2026-07-11: Added durable approved closeout adjustment posting. `retailOps.reviewCloseoutSession` now writes `CLOSEOUT_ADJUSTMENT` movement rows for approved non-zero closeout stock variances, using `RetailOpsStockDeclaration` expected/counted quantities as before/after central-stock or staff-wallet snapshots. Durable delivery headers/lines, report reads, migration application, and live DB validation remain pending.
- 2026-07-11: Added durable-first stock movement history reads. `retailOps.stockMovements` now queries `InventoryMovement` rows first for stock intake, adjustment/damage/loss, conversion, sale deductions, staff assignment/return, opening stock, sync correction, and closeout adjustment history, maps them into the existing movement-history DTO, and de-dupes against legacy metadata/order/session fallback rows. Durable delivery headers/lines, migration application, and live DB validation remain pending.
- 2026-07-11: Added durable stock delivery header/line persistence for external-id-backed stock intake. `retailOps.recordStockIntake` now upserts a received `StockDelivery` using the intake external id as the reference number, creates or updates the matching `StockDeliveryLine`, and links the durable `STOCK_INTAKE` movement to both records. Migration application, live DB validation, richer delivery source modeling, and multi-line delivery workflows remain pending.
- 2026-07-11: Added durable opening-stock movement persistence during product setup. `retailOps.createProduct` now writes `InventoryMovement(OPENING_STOCK)` rows for positive starting quantities when the stock-ledger migration is available, using `PRODUCT_SETUP` source, zero-to-opening balance snapshots, actor/setup metadata, and product/variant/inventory links. Migration application, live DB validation, and richer opening-stock correction workflows remain pending.

## Linked Task
- Task Title: Stock Intake And Unit Conversion Ledger
- Task File: brain/tasks/roadmap.md
