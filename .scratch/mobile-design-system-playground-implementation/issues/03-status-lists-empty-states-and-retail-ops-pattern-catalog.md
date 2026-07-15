# 03 — Status, Lists, Empty States, And Retail Ops Pattern Catalog

**What to build:** the operational component catalog so the playground demonstrates badges, banners, loading/error/empty states, timeline rows, product and inventory rows, sale rows, staff/customer rows, dashboard panels, report rows, session/sync/share-link primitives, and state variants.

**Blocked by:** 01 — Mobile Design-System Playground Shell And Catalog; 02 — Tokens, Typography, Headers, Actions, And Forms Catalog.

**Status:** implementation-complete

- [x] Status examples cover default, primary, success, warning, destructive, muted, offline, pending, syncing, synced, failed, and conflict states.
- [x] Empty, loading, and error examples show clear copy, icons, actions, and light/dark treatment.
- [x] List examples include product, inventory, sale, staff, customer, timeline, report, session, sync, and share-link rows.
- [x] Dashboard and Retail Ops pattern examples use existing shared primitives instead of one-off local widgets.
- [x] Examples distinguish selectable, selected, disabled, display-only, and destructive row states.
- [x] Compact-phone text fit and divider-based density are preserved across examples.

## Implementation Notes

- Added status badge/banner, empty state, product row, sale row, staff/customer row, share-link row, and timeline examples.
- Added a Retail Ops pattern section that exercises dashboard, setup, inventory, sale, session, share-link, and sync primitives together.
- The examples use static sample data only and do not call production APIs.
