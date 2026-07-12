# 03 — Mobile Dashboard Production Snapshot

**What to build:** owner and attendant dashboards show the core operational snapshot from production when online, while preserving local/offline fallback state. The dashboard should stay minimal and role-appropriate: owners see business health and management entry points, attendants see selling and assigned-work tools.

**Blocked by:** 02 — First Product Setup Wizard.

**Status:** implementation-complete

- [x] The dashboard reads production summary and recent activity when online.
- [x] The dashboard falls back to local state when offline or production reads fail.
- [x] Owner view shows sales totals, inventory status, low-stock signals, staff activity, customer entry points, sync state, and subscription status.
- [x] Attendant view prioritizes create sale, recent sales, assigned or available inventory, customer lookup, and sync status.
- [x] Offline and sync state are visible without blocking the primary selling flow.
- [x] Dashboard sections remain small reusable components rather than one bulky screen component.

## Implementation Notes

- `apps/mobile/src/app/dashboard.tsx` now reads `retailOps.summary`, `retailOps.recentSales`, `retailOps.subscription`, `retailOps.staff`, and `retailOps.customerBook` when online.
- Production staff, customer, subscription, and recent-sale snapshots are merged with local pending rows where useful, and local state remains the fallback while offline or when a production query fails.
- Mobile auth sessions now preserve the production membership role, and the dashboard hides owner-only plan, report, closeout, add-item, and staff-invite entry points for cashier/operator roles.
- Cashier/operator dashboards also avoid owner setup paths when inventory is empty: the empty-inventory state now shows neutral assigned-inventory copy instead of the first-product setup CTA, New sale no longer opens first-product setup for attendants, and Restock, Convert, plus stock-movement Record actions are hidden from attendant dashboards.
- `apps/mobile/src/store/businessStore.ts` can seed the local active business with the production tenant id from the authenticated profile, keeping local/offline records aligned to the server business.
- Added focused DB query coverage for the production dashboard/report foundation. `packages/db/src/queries/retail-ops.test.ts` proves inventory snapshots return active product units with on-hand/reserved stock and fallback rows for products without variants, sales-by-product reports group quantity and gross totals by product/unit while preserving optional actor scope, and dashboard summary aggregates production orders, receipts, inventory, open sessions, cash/transfer payment buckets, low-stock counts, and store metadata.
- Scoped static checks passed. Live Expo simulator, real production dashboard queries, and hands-on compact-phone interaction QA were not run in this slice.
