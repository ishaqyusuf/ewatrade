# Plan: Retail Ops Dashboard Reports

## Type
Feature

## Status
In Progress

## Created Date
2026-07-06

## Last Updated
2026-07-11

## Intake
- Intake File: .brain/intake/2026-07-06-sales-management-saas-mvp.md
- Intake Item: Admin can monitor sales, stock, cash expected, and reports.

## Goal Or Problem
Give owners/admins clear daily visibility into sales, rep performance, stock balances, expected versus received cash, credit sales, shortages, price history, and stock deliveries.

## Current Context
The dashboard app now has a first Retail Ops Reports screen at `/analytics`, labeled Reports in the tenant sidebar. It is a production-read reporting surface backed by the existing `retailOps` tRPC procedures.

The mobile MVP now has a production-aware reports bridge. The dashboard shows a Reports summary card, and the Reports sheet reads production summary, inventory, sales-by-rep, sales-by-product, credit-sales, and payment-reconciliation data when online, while keeping app-local sales, products, stock movements, closeouts, and sync events as offline/unavailable fallbacks.

The API now has tenant/store scoped Retail Ops read procedures for summary, inventory snapshot, sales by product, sales by rep, metadata-backed price history, metadata-backed stock movements, recent sales, credit sales, sessions, payment reconciliation, sync history, and sync conflict review. The dashboard Reports screen uses those procedures for store/date-range report cards, payment-method breakdowns, sales by attendant, sales by product/unit, stock balance, price history, stock movements, credit sales, payment reconciliation, stock variance, sync operations, sync conflict review, CSV export, browser print-to-PDF export, and table-level filters for attendant, product, unit, payment method, movement type, credit aging, closeout status, sync status, and sync device. Stock movements now include metadata-backed manual Stock adjustment rows and closeout variance-derived Stock adjustment rows in addition to opening stock, stock intake, conversion, sale deduction, staff assignment, and staff return rows.
Durable stock/price ledgers, durable delivery/conversion tables, guided sync-conflict resolution actions, server-generated packaged exports, and write/persistence procedures remain future slices.

## Proposed Approach
Create dashboard reports backed by the stabilized sales, inventory ledger, session, and closeout data. Start with operational daily reports rather than broad BI: today, date range, by rep, by product/unit, stock balance, cash reconciliation, credit, shortage, price history, and delivery/conversion history.

## Implementation Steps
- Define report queries for daily sales, sales by rep, sales by product/unit, stock balance, cash expected versus declared, credit sales, shortages, price history, and delivery history.
- Build dashboard report navigation and filters: business/store, date range, rep, product, and status.
- Add summary cards for sales total, expected cash, declared cash, credit, shortage value, and unsynced events.
- Add tables/charts appropriate for repeated operational use.
- Ensure reports respect tenant and role permissions.
- Add empty/loading/error states and export-ready table structure if feasible.

## Affected Files Or Areas
- `apps/dashboard`
- `packages/db/src`
- `packages/db/prisma/models/commerce.prisma`
- `packages/db/prisma/models/pos.prisma`
- `.brain/modules/merchant-system.md`

## Acceptance Criteria
- Admin can view daily sales totals and sales by rep.
- Admin can view stock balances by product/unit.
- Admin can compare expected versus declared cash/payment totals.
- Admin can view credit sales and stock shortage/variance reports.
- Admin can view price history and stock delivery/conversion history.

## Test Plan
- Run `bun run typecheck`.
- Add or run report-query tests with seeded sales/stock/session data.
- Manually verify report totals against a known open-sale-close scenario.

## Brain Update Requirements
- Update `.brain/modules/merchant-system.md` and create/update a Retail Ops reporting feature doc.

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
- Reports can disagree if they mix ledger source data and denormalized balances without clear definitions.
- Offline pending sales should be represented separately from synced totals.
- Large date ranges may need pagination or aggregation.

## Open Questions
- TODO: Confirm whether server-generated PDF export, packaged downloads, or scheduled report delivery are needed beyond the current CSV and browser print-to-PDF paths.

## Progress Notes
- 2026-07-10: Added the first mobile local reporting slice. The mobile dashboard now has a Reports card and keyboard-safe Reports sheet with today sales/payment totals, sales by attendant, sales by product/unit, stock balance/current price snapshots, stock delivery/conversion history, latest closeout variance, and pending sync count.
- 2026-07-10: Added the first production Retail Ops API read scaffold. The `retailOps` tRPC router is mounted on the app router with protected `summary`, `inventory`, and `salesByProduct` procedures backed by focused database query helpers and shared API schemas.
- 2026-07-10: Added the first production recent-sales read bridge. `retailOps.recentSales` returns recent in-person Retail Ops sale orders for the selected tenant/store with line, customer, payment, receipt, actor, and cashier-session summary data while excluding pending shared-link order requests.
- 2026-07-10: Added the first production sales-by-rep read bridge. `retailOps.salesByRep` groups in-person Retail Ops sale orders by actor id, joins known users for display names, and returns sale count, quantity, gross sales, cash, transfer, card, credit, session ids, and last sale timestamp for the selected tenant/store range.
- 2026-07-10: Added the first production payment-reconciliation read bridge. `retailOps.paymentReconciliation` returns closed-session receipt totals, expected cash, declared closing cash, and cash variance for the selected tenant/store range.
- 2026-07-10: Added the first production credit-sales read bridge. `retailOps.creditSales` returns pending in-person credit sale orders with due date, aging bucket, amount due, paid amount, repayment events, customer, actor, payment state, and line details for the selected tenant/store range.
- 2026-07-10: Added the first production session-list read bridge. `retailOps.sessions` returns bounded open, closed, or all cashier sessions with rep identity, receipt totals, expected cash, and variance summary for the selected tenant/store range.
- 2026-07-10: Added a manager-facing sync operations section to the mobile Reports sheet. Reports now summarize connection mode, current offline device, last local sync summary, and pending/retry/review queue counts alongside the sales, stock, and closeout report snapshots.
- 2026-07-10: Added production report reads to the mobile Reports sheet. When online, the sheet now calls `retailOps.summary`, `retailOps.inventory`, `retailOps.salesByRep`, `retailOps.salesByProduct`, `retailOps.creditSales`, and `retailOps.paymentReconciliation`, shows a source status row, and falls back to local report data when offline or when a production read is unavailable.
- 2026-07-10: Added the first dashboard Reports screen at `/analytics`. The tenant sidebar now labels the route Reports, and the screen uses typed `retailOps` tRPC reads for active-store/date-range summary cards, sales-by-attendant, sales-by-product/unit, stock balance, credit sales, payment reconciliation, stock variance, and CSV exports for each operational table.
- 2026-07-10: Added table-level dashboard report filters. Reports can now narrow exportable table rows by attendant, product, unit, credit aging, and closeout status, with filter-aware empty states and reset behavior.
- 2026-07-10: Added dashboard sync operations visibility. Reports now read `retailOps.syncHistory`, show recent sync issue counts, list recent replay outcomes with device/status/event totals/last issue details, support sync-status and sync-device filters, and export the filtered sync operations table.
- 2026-07-10: Added dashboard payment-method reporting. Reports now derive a payment-method breakdown from sales-by-attendant and payment-reconciliation buckets, compare sales amount, reconciled receipts, declarations, and variance, support a payment-method filter for relevant payment tables, and export the filtered payment breakdown.
- 2026-07-10: Added first production price-history reporting. `retailOps.priceHistory` now returns bounded metadata-backed product-unit price history for the selected store/date range, and the dashboard Reports screen shows/export previous, new, and current prices with product/unit filters.
- 2026-07-10: Added first production stock-movement reporting. `retailOps.stockMovements` now returns bounded metadata-backed stock intake and unit conversion movement rows for the selected store/date range, and the dashboard Reports screen shows/exports stock intake, conversion-out, and conversion-in rows with product/unit/movement filters.
- 2026-07-10: Added order-derived sale deductions to stock movement reporting. `retailOps.stockMovements` now also includes completed Retail Ops sale line items as outgoing sale movements, and new sales store before/after stock movement snapshots on the order item for cleaner future audit display.
- 2026-07-10: Added staff custody movements to stock movement reporting. `retailOps.stockMovements` now includes metadata-backed staff stock assignments and returns as movement rows, and the dashboard Reports movement filter/export recognizes Staff assignment and Staff return types.
- 2026-07-11: Added opening-stock rows to stock movement reporting. `retailOps.stockMovements` now derives incoming opening-stock movements from product-unit setup metadata and the dashboard Reports movement filter/export recognizes Opening stock as a movement type.
- 2026-07-11: Added first dashboard PDF/export packaging. The Reports screen now offers a global PDF action that uses browser print-to-PDF, hides filter/export controls from the printed body, and includes store/date context in the print header while keeping server-generated packaged exports as a future slice.
- 2026-07-11: Added closeout stock adjustment rows to stock movement reporting. `retailOps.stockMovements` now derives Stock adjustment rows from non-zero closeout inventory variance lines, and the dashboard movement filter/export recognizes Stock adjustment as a movement type.
- 2026-07-11: Added manual stock adjustment rows to stock movement reporting. `retailOps.stockMovements` now maps metadata-backed `retailOps.recordStockAdjustment` replay records into Stock adjustment rows alongside closeout variance-derived rows.
- 2026-07-11: Added dashboard sync conflict review visibility. Reports now read `retailOps.syncConflicts`, include unreviewed conflicts in the Sync issues metric, list conflict event/device/actor/error details in a full-width review table, support the existing sync-device filter, export conflicts to CSV, and call `retailOps.reviewSyncConflict` to acknowledge returned conflicts before refreshing sync state.

## Linked Task
- Task Title: Retail Ops Dashboard Reports
- Task File: .brain/tasks/roadmap.md
