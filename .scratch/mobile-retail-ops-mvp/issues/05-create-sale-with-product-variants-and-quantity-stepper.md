# 05 — Create Sale With Product Variants And Quantity Stepper

**What to build:** an attendant can start a sale, choose the right sellable product unit or variant, enter quantity with a polished plus/minus/numeric control, see the total immediately, choose cash or transfer, and complete the sale. The flow should use production sale creation when online and queue idempotent offline sales when needed.

**Blocked by:** 02 — First Product Setup Wizard; 04 — Staff Invite And Attendant Onboarding.

**Status:** implementation-complete

- [x] Create-sale opens from a clear primary action on the attendant dashboard.
- [x] Product lists are virtualized for realistic catalogs.
- [x] Products with variants show the parent as display-only and the variants as selectable rows.
- [x] Products without variants expose the primary unit as directly selectable.
- [x] Selectable rows show product name, unit or variant name, price, and available stock.
- [x] Quantity control supports minus, plus, and numeric keyboard input with visible total preview.
- [x] Checkout captures cash or transfer and records the sale with sale-time price snapshots.
- [x] Online sales call production APIs when product unit and session ids are available; otherwise sales are queued locally.

## Implementation Notes

- Protected sales APIs now live in `apps/api/src/trpc/routers/retail-ops-sales.ts` and are merged back into the stable `retailOps.*` namespace. `retailOps.createSale`, `retailOps.recentSales`, `retailOps.creditSales`, and `retailOps.recordCreditPayment` keep their mobile procedure names while no longer living inside the larger core Retail Ops router. `bun run --cwd apps/mobile qa:create-sale-flow`, `bun run --cwd apps/mobile qa:dashboard-production-flow`, `bun run --cwd apps/mobile qa:reports-flow`, `bun run --cwd apps/mobile qa:retail-ops-api-boundary`, `bun --filter @ewatrade/api typecheck`, `bun --cwd apps/mobile tsc --noEmit --pretty false`, `bun run --cwd apps/mobile qa:mvp-source`, and `bun run --cwd apps/mobile qa:mvp-contracts` passed.
- `apps/mobile/src/components/mobile/create-sale-sheet.tsx` now renders product selection through `BottomSheetSectionList` for a virtualized bottom-sheet catalog.
- Product section headers are display-only parent rows. Products with variants expose only variant rows as selectable; products without variants expose the primary unit row.
- Selectable sale rows show product name, sellable unit/variant name, price, available stock, selected state, disabled out-of-stock state, haptics, and press feedback.
- The existing quantity stepper provides minus, plus, and numeric keyboard entry; the sheet shows the total preview on the same flow.
- The existing submit path still calls `retailOps.createSale` when the selected unit and rep session have production ids, then records the synced sale locally. Otherwise it records an idempotent local queued sale for sync.
- Added focused DB query coverage for production sale creation. `packages/db/src/queries/retail-ops-sales.test.ts` proves `createRetailOpsSale` resolves the sale-time unit price from durable price history, snapshots product/unit/customer/payment metadata, atomically decrements available store stock with reserved-stock protection, creates the completed order and receipt, writes a durable `SALE_DEDUCTION` movement ledger row, and returns an existing sale for duplicate external ids without creating another order, receipt, movement, or stock deduction.
- Extended focused DB query coverage for credit sale reporting and settlement. `packages/db/src/queries/retail-ops-sales.test.ts` now proves credit sales listing preserves actor scope, overdue aging, balances, payments, and line snapshots; sales-by-rep reports bucket cash, transfer, card, credit, quantity, sessions, and gross totals by attendant; and `recordRetailOpsCreditPayment` writes the receipt plus settled credit metadata for outstanding balances.
- Added API schema coverage for checkout contact email normalization. Sale payloads now trim and lowercase optional customer emails before validation while still rejecting invalid email formats.
- Added API schema coverage for optional checkout phone normalization. Sale payloads now trim customer phone input, treat blank phone values as absent, and reject oversized phone values.
- Scoped static checks passed. Direct Bun import is not useful for this component because React Native's package entry includes Flow syntax. Full mobile `tsc` still fails on existing project-wide generated route/icon/shared-ui issues outside this ticket, while also confirming the bottom-sheet section list export exists.
