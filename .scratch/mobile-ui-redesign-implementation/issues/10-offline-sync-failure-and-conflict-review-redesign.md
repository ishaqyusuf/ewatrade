# 10 — Offline Sync, Failure, And Conflict Review Redesign

**What to build:** redesigned reliability states across the app: offline banner, queued changes, pending/syncing/synced/failed/conflict states, retry actions, conflict review rows, manager acknowledgement, and clear business-impact messaging.

**Blocked by:** 01 — Mobile Design Foundation And Reusable Primitives; 02 — Floating App Shell And Role-Aware Navigation; 05 — Owner And Attendant Dashboard Redesign; 06 — Create Sale And Checkout Redesign

**Status:** implementation-complete

- [x] Offline banner is persistent, clear, and non-blocking across core screens.
- [x] Sync status distinguishes offline, pending, syncing, synced, failed, and conflict.
- [x] Queue and sync rows show affected entity, business impact, recommended action, and retry or acknowledgement controls where allowed.
- [x] Manager-only conflict review is visually clear and permission-aware.
- [x] Offline sale and pending-change states are visible in the workflows where they matter.
- [x] Reliability states work in light and dark mode without relying on color alone.

## Implementation Notes

- `SyncStatusSheet` now uses shared `StatusBadge`, `StatusBanner`, and `EmptyState` primitives for event status, last sync, server history, conflict summary, retry summary, sync mutation errors, device registration errors, blocked dependencies, and clear queue states.
- Existing offline toggle, offline device identity, sync replay, retry, conflict review, server history, server conflict, and QA `testID` hooks are preserved.
- Business-impact and recommended-action copy remains visible for failed/conflict rows and server conflict review.
- Dashboard offline banner behavior, offline sale indicators, and workflow-level pending states are preserved through existing source checks.
