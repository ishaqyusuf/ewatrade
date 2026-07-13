# 07 — Product And Inventory Management Redesign

**What to build:** redesigned product and inventory management surfaces: product list, search/filter, product detail, variant/sub-unit rows, price/stock states, low/empty stock, edit/add flows, destructive actions, share entry points, and graceful no-image placeholders.

**Blocked by:** 01 — Mobile Design Foundation And Reusable Primitives; 02 — Floating App Shell And Role-Aware Navigation; 04 — First Product Setup And Starting Inventory Redesign

**Status:** implementation-complete

- [x] Product list, search, and filter states use reusable inventory cards and controls.
- [x] Product detail distinguishes product identity, units/variants, price, stock, and available actions.
- [x] Variant/sub-unit rows are easy to scan and edit without confusing them with parent products.
- [x] Low-stock, empty-stock, loading, empty, and error states are visually distinct.
- [x] Product image absence falls back to a polished icon or neutral placeholder.
- [x] Destructive actions are visually careful and require clear confirmation.
- [x] Product share entry points are available where role permissions allow.

## Implementation Notes

- Added a reusable `InventoryProductCard` with icon placeholders, selected state, stock badges, and optional price/conversion labels for product and variant rows.
- Stock intake and unit conversion now use shared `InventoryProductCard`, `StatusBanner`, `StatusBadge`, and `EmptyState` primitives for product lists, unit/variant rows, source state, shortage, empty search, empty inventory, and submit error states.
- Product and variant rows keep search/filter limits and remain easy to scan without confusing parent products with sellable sub-units.
- Existing destructive/careful adjustment logic, insufficient-stock blocking, production tRPC mutations, local/offline fallback, stock movement ledger updates, and dashboard share/restock/convert entry points are preserved.
