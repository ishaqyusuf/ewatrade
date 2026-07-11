# Retail Ops Reporting

## Purpose

Define the operational reporting model for Retail Ops so owners can understand sales, stock, payments, reps, closeouts, and exceptions without turning the MVP into a broad BI tool.

## MVP Reporting Position

Reports should answer daily operating questions:

- How much did we sell today?
- Who recorded the sales?
- Which products and units are moving?
- What stock remains by product and unit?
- What cash and transfer amount should be declared?
- Did closeout reveal payment or stock variance?
- Which stock deliveries, conversions, and opening stock movements happened?
- Which events are still pending sync?
- Which server sync conflicts still need manager review?

## Mobile Report Bridge

The mobile MVP exposes a Reports card and Reports sheet with production tRPC reads when online and app-local data as the offline/unavailable fallback.

The mobile sheet includes:

- today gross sales and transaction count
- expected cash and transfer totals
- pending sync count
- latest closeout status
- sales by attendant
- sales by product and unit
- outstanding credit sales
- stock balance and current price snapshot
- delivery and conversion movement history
- cash and stock variance from latest closeout
- report source state for online, mixed, or local/offline data

Effective-date price lookup, durable stock-movement ledgers, deeper dashboard filters, and packaged/scheduled export delivery remain future slices.

## Dashboard Report Screen

The dashboard app now exposes the first production report screen at `/analytics`, labeled Reports in the tenant sidebar.

The dashboard screen includes:

- active store selection
- today, 7-day, and 30-day presets
- custom date range inputs
- summary cards for gross sales, expected cash, declared cash, cash variance, open credit balance, and stock units
- payment-method breakdown table comparing sales, reconciled receipts, closeout declarations, and variance
- sales-by-attendant table with payment splits and CSV export
- sales-by-product/unit table with CSV export
- stock-balance table with available quantity and current price snapshots
- durable-first price-history table with previous, new, and current unit price plus metadata fallback during rollout
- stock-movements table for metadata-backed opening stock, stock intake, manual stock adjustment, conversion, staff assignment, staff return, closeout stock adjustment, and order-derived sale deduction rows
- open credit-sales table
- payment-reconciliation table by cashier session
- stock-variance table derived from closeout inventory lines
- table filters for attendant, product, unit, movement type, credit aging, and closeout status
- sync operations metric and table from recent offline replay history
- sync-status and sync-device filters with CSV export
- sync conflict review table for owner/admin/manager users, with unreviewed conflict counts, device filtering, CSV export, and a review acknowledgement action
- global PDF action using browser print-to-PDF, with report controls hidden from the printed body and store/date context included in the print header

This is a first production-read screen backed by the existing `retailOps` tRPC procedures. Server-generated PDFs, scheduled reports, guided sync-conflict resolution actions, durable stock-movement ledgers, and effective-date price lookup remain future work.

## Production API Phase 1

The first production read surface now lives behind the `retailOps` tRPC router.

Implemented procedures:

- `retailOps.summary`: tenant/store scoped dashboard summary for the selected range, including order totals/counts, receipt payment totals, inventory counts, open cashier sessions, and store identity.
- `retailOps.inventory`: tenant/store scoped product and unit stock snapshot using current product variants and inventory items.
- `retailOps.salesByProduct`: tenant/store scoped sales grouped by product and unit for the selected range.
- `retailOps.salesByRep`: tenant/store scoped in-person sales grouped by sale actor for the selected range, including payment buckets, quantity, session ids, and user display data when available.
- `retailOps.priceHistory`: tenant/store scoped durable-first product-unit price history for the selected range, including product/unit identity, previous price, new price, current price, source, actor, reason, and effective time, with product-variant metadata fallback while migrations roll out.
- `retailOps.stockMovements`: tenant/store scoped stock movement history for the selected range, with metadata-backed opening stock, stock intake/conversion rows, paired conversion-out and conversion-in rows, manual stock adjustment rows, staff assignment/return custody rows, closeout variance-derived stock adjustment rows, order-derived sale deductions, before/after balances when the source captured them, source/related-unit details, and CSV-ready fields.
- `retailOps.customerBook`: tenant/store scoped customer lookup derived from recent non-cancelled order customer fields.
- `retailOps.recentSales`: tenant/store scoped recent in-person Retail Ops sale list with line, customer, payment, receipt, actor, and cashier-session summary data.
- `retailOps.creditSales`: tenant/store scoped pending credit sale list with due date, aging bucket, amount due, paid amount, repayment events, customer, actor, payment state, and sale-line details.
- `retailOps.sessions`: tenant/store scoped cashier session list with open/closed filters, rep identity, receipt totals, expected cash, and variance summary.
- `retailOps.paymentReconciliation`: tenant/store scoped closed-session payment report with receipt totals, expected cash, declared closing cash, and cash variance.
- `retailOps.syncHistory`: tenant scoped recent offline replay history, with owner/admin/manager users seeing tenant history and cashier/operator users scoped to their own runs.
- `retailOps.syncConflicts`: tenant scoped unreviewed server-recorded sync conflicts for owner/admin/manager review.
- `retailOps.reviewSyncConflict`: owner/admin/manager acknowledgement mutation for a returned sync conflict.

Owner/admin/manager users can read selected-store operational report data. Cashier/operator users are actor-scoped for sales-derived reports, customer-book reads are limited to their attributed sales or shared-link order requests, and session/payment-reconciliation reads are limited to their own cashier sessions.

This phase currently reads existing Store, Product, ProductVariant, InventoryItem, Order, OrderItem, Receipt, and CashierSession records, plus bounded Store metadata for first-phase stock movement reads. Price-history reports now read durable `ProductUnitPriceHistory` rows first and merge legacy product-variant metadata during rollout. The Prisma source schema and migration folder now include durable StockDelivery, StockDeliveryLine, and InventoryMovement tables for the future ledger-backed report source, but the live stock-movement report procedures have not switched to those tables yet. It does not yet cover durable credit aging reports, durable closeout approval, server-generated PDF export, or scheduled report delivery.

## Production Report Surfaces

### Mobile

Mobile should keep compact operational snapshots:

- today overview
- stock and movement snapshot
- rep/session snapshot
- sync exceptions
- closeout status

### Dashboard

Dashboard should own full operational reports:

- date range filters
- business/store filters
- rep filters
- product and unit filters
- payment method filters
- sync and closeout status filters
- export-ready tables
- browser print-to-PDF report packaging
- variance and exception review
- sync conflict review acknowledgement

The first dashboard screen now covers the business/store and date-range layer plus exportable operational tables. It also has table-level attendant, product, unit, payment method, stock movement type, credit aging, closeout status, sync status, and sync-device filters, and it surfaces unreviewed server sync conflicts for manager acknowledgement.
Deeper exception filters remain future dashboard refinements.

## Report Definitions

### Daily Sales

Sum completed sales by tenant/business, date range, payment method, rep, product, and unit. Use sale-time price snapshots, not current product prices.

### Sales By Rep

Group sales by rep/attendant and session. Include sale count, gross sales, cash, transfer, credit when available, pending sync count, and closeout state.

### Sales By Product And Unit

Group sales by product and unit/variant. Include quantity sold, gross sales, current stock, and low-stock signal.

### Stock Balance

Report current stock by product, primary unit, and variant. Production should derive audit views from inventory movement ledgers, not only denormalized balances.

### Payment Reconciliation

Compare expected cash/transfer from sales against declared cash/transfer from closeout. Highlight positive and negative variances separately.

### Shortage And Variance

Report stock variances from opening inventory and closeout lines. Include product, unit, expected quantity, declared quantity, variance, attendant, session, and note.

### Price History

Show effective price changes by product/unit over time. The production report reads durable unit price history when available and merges metadata-backed legacy entries during rollout. Effective-date price lookup remains future work. Historical sales must keep their sale-time price snapshot.

### Delivery And Conversion History

Show opening stock, stock intake, unit conversion in/out, sale deduction, adjustment, assignment, and return movements. The first production report reads product setup opening stock plus bounded metadata-backed stock intake, stock adjustment, conversion, staff assignment, and staff return records, derives sale deductions from Retail Ops order items, and derives additional stock adjustment rows from non-zero closeout inventory variance lines. Durable movement tables now exist in the Prisma source schema as the target ledger source, but repository writes and report reads still need to migrate to them.

## Query Boundary

Production reports should be served by focused tRPC procedures that call reporting services and query modules.

Current first-phase Retail Ops procedures:

- `retailOps.summary`
- `retailOps.inventory`
- `retailOps.salesByProduct`
- `retailOps.salesByRep`
- `retailOps.priceHistory`
- `retailOps.stockMovements`
- `retailOps.customerBook`
- `retailOps.recentSales`
- `retailOps.creditSales`
- `retailOps.sessions`
- `retailOps.paymentReconciliation`
- `retailOps.syncHistory`
- `retailOps.syncConflicts`
- `retailOps.reviewSyncConflict`

Future report procedures:

- `reports.today`
- `reports.salesByRep`
- `reports.salesByProduct`
- `reports.stockBalance`
- `reports.paymentReconciliation`
- `reports.variance`
- `reports.stockMovements`

All report queries must include tenant/business scoping and role checks.

## Open Questions

- Confirm whether server-generated PDF export, packaged downloads, or scheduled report delivery are needed beyond the current CSV and browser print-to-PDF paths.
- Confirm whether credit sales are in the first paid release or a follow-up slice.
- Confirm report history limits per subscription tier.
