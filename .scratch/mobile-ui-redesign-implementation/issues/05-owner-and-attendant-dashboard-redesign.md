# 05 — Owner And Attendant Dashboard Redesign

**What to build:** role-specific dashboard screens using the new card/status/action system: owner metrics, inventory signals, staff activity, subscription/sync status, recent sales, quick actions, attendant-focused sales entry, and empty new-user states.

**Blocked by:** 01 — Mobile Design Foundation And Reusable Primitives; 02 — Floating App Shell And Role-Aware Navigation

**Status:** implementation-complete

- [x] Owner dashboard shows sales, inventory, staff, subscription, sync, recent activity, and quick actions in a compact operational layout.
- [x] Attendant dashboard prioritizes create sale, recent sales, customer lookup, available/assigned inventory, and sync state.
- [x] Owner-only actions are hidden from attendant dashboards while preserving role-safe messaging.
- [x] Empty new-user and empty-data states guide the user to the next useful action.
- [x] Offline, loading, failed, and production-unavailable dashboard states are visible and consistent.
- [x] Light and dark dashboard screenshots verify readability and density.

## Implementation Notes

- Dashboard now uses shared `StatusBadge` chips for pending sync, payment, staff, customer, product-link, low-stock, and stock-movement states.
- Empty dashboard sections now use the shared `EmptyState` primitive for low stock, attendants, stock movements, customer book, and recent sales.
- The existing owner/attendant role gating, quick-action filtering, production snapshot queries, offline sync banner, and local fallback behavior were preserved.
- Added `qa:dashboard-redesign` and wired it into mobile source QA to protect the redesigned shell, sections, shared primitives, role gating, and empty states.
