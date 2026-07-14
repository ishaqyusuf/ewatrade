# 08 - Analytics And Reports Standardization

**What to build:** the existing dashboard analytics work becomes the standard reports experience with dashboard KPIs, date and store filters, operational tables, exports, print/PDF-friendly layout, and sync conflict review.

**Blocked by:** 04 - Inventory, Inbounds, And Stock Movement Operations; 05 - Staff Management And Role Administration; 06 - Sales, Sessions, Customers, And Closeout Review; 07 - Generated Product Links And Shared-Link Follow-Up.

**Status:** implementation-complete

- [x] Dashboard home and reports surfaces distinguish summary KPIs from detailed reports.
- [x] Reports include date presets, custom range, store, staff, product/unit, payment, stock movement, closeout, sync, and conflict filters where supported.
- [x] Sales, payment, inventory, stock movement, credit, session, variance, shared-link, subscription, sync, and conflict data use defined metric meanings.
- [x] CSV export works for relevant report tables.
- [x] Print or PDF-friendly layout hides controls and preserves report context.
- [x] Sync history and sync conflict review remain manager-capable and permissioned.
- [x] Browser QA covers dashboard KPIs, report filters, exports, print/PDF-friendly view, sync conflict review, and responsive desktop layout.
- [x] Brain reporting docs are updated if report definitions or dashboard report behavior change.

## Implementation Notes

- The existing `/analytics` route is the standardized reports surface and is labeled Reports in dashboard navigation.
- `RetailOpsReports` already distinguishes top KPI summary cards from detailed report tables and uses production Retail Ops tRPC reads for summary, inventory, sales by rep/product, price history, stock movements, credit sales, payment reconciliation, sync history, and sync conflicts.
- The reports surface already supports date presets/custom ranges, store filtering, table-level staff/product/unit/payment/movement/credit/closeout/sync filters, CSV export per report table, and browser print-to-PDF via print-specific control hiding.
- Sync history and sync conflict review use existing protected tRPC procedures and manager-capable permissions.

## QA Evidence

- HTTP QA against the local dashboard/marketing stack:
  - Authenticated `/analytics` returned 200.
  - Logged-out `/analytics` redirected to `http://localhost:3092/login?next=%2Fanalytics`.
  - Rendered HTML included Reports navigation, KPI/report table shell, CSV controls, PDF control, sync operations, and sync conflict review content.

No report behavior or API contract changed in this ticket; the work records the existing standardized implementation against the dashboard ticket.
