# 08 — Sync Failure And Conflict Review UX

**What to build:** failed and conflicted sync work is visible and understandable to the people who can resolve it. Attendants can see when their device has failed work, while managers can review tenant-level conflicts and acknowledge or act on them.

**Blocked by:** 07 — Offline Sale And Inventory Sync Flow.

**Status:** implementation-complete

- [x] Sync status distinguishes offline, pending, syncing, synced, failed, and conflict states.
- [x] Mobile sync surface shows recent sync history and failed events for the current device.
- [x] Manager-capable users can see server-recorded conflicts from mobile.
- [x] Admin reporting surfaces include tenant-level unreviewed conflict counts and filtering by sync device.
- [x] Conflict rows explain the failed event, business impact, and recommended resolution action.
- [x] Managers can acknowledge reviewed conflicts without hiding unresolved local failures from the originating device.

## Implementation Notes

- `apps/mobile/src/components/mobile/sync-status-sheet.tsx` now shows local pending/retry/review counts, current-device server history, current-device server conflict counts, business-wide server conflict counts, and business-wide conflict rows for manager-capable users.
- Local failed and conflicted event rows now explain the user-facing business impact plus a recommended action before retry or review, while keeping the device-local failed/conflict state intact.
- Server conflict rows now show event type, source device, server error, business impact, API-provided resolution action/detail, and an acknowledge/review button wired to `retailOps.reviewSyncConflict`.
- Reviewing a server conflict refreshes server history/conflicts only; it does not clear local failed or conflicted queue rows on the originating device.
- `apps/mobile/src/components/mobile/reports-sheet.tsx` now adds a tenant-level server conflict count, filtered conflict count, all-devices/current-device conflict filter, and conflict rows with impact plus recommended resolution.
- The backend already enforces manager-capable permissions on `retailOps.syncConflicts` and `retailOps.reviewSyncConflict`; cashier/operator users keep their local device failure visibility without gaining tenant-wide conflict review.
- Added focused DB query coverage for the sync ledger and conflict review path. `packages/db/src/queries/retail-ops-sync.test.ts` proves durable sync runs compute status/counts, write scoped event rows, list unreviewed durable and metadata conflicts with resolution guidance while excluding reviewed metadata events, and review durable conflicts without clearing device-local failures.
- Scoped static checks passed. Live production conflict listing, review acknowledgement, role-permission testing, and hands-on mobile QA were not run in this slice.
