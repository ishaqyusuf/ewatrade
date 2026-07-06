# Plan: Offline-First Sales Sync

## Type
Feature

## Status
Proposed

## Created Date
2026-07-06

## Last Updated
2026-07-06

## Intake
- Intake File: brain/intake/2026-07-06-sales-management-saas-mvp.md
- Intake Item: Offline feature and online sync for sales reps.

## Goal Or Problem
Allow reps to clock in, confirm stock, record sales, and prepare closeout while offline, then safely sync without duplicate sales or silent inventory corruption when connectivity returns.

## Current Context
The app currently has Next.js POS/dashboard surfaces but no documented offline storage, sync queue, idempotency model, conflict resolution, or PWA/native offline strategy.

## Proposed Approach
Implement offline-first behavior for the rep/POS workflow using a local durable queue and server idempotency keys. Syncable events should include session open, opening inventory confirmation, sale created, loss/damage note, and closeout draft. The UI must show sync state and block/admin-flag closeout when conflicts exist.

## Implementation Steps
- Decide initial offline target: web PWA with IndexedDB/local storage wrapper or native app local database.
- Define sync event envelope: client event id, tenant id, rep id, device id, event type, payload, created at, and dependency ordering.
- Add server-side idempotency keys and conflict detection for sales/session/inventory events.
- Build local queue service for POS/rep actions.
- Build sync status UI: offline, pending sync, syncing, synced, failed, conflict.
- Add conflict handling for duplicate sale, stale price, insufficient expected stock, closed session, and changed assignment.
- Add retry/backoff and safe resume after app reload.
- Add tests for duplicate submission and out-of-order sync.

## Affected Files Or Areas
- `apps/pos`
- `packages/utils`
- `packages/db/prisma/models/pos.prisma`
- `packages/db/prisma/models/commerce.prisma`
- `packages/db/src`
- `brain/system/architecture.md`

## Acceptance Criteria
- Rep can record sales while offline and see pending sync status.
- Reconnecting syncs queued events exactly once.
- Duplicate event replay does not create duplicate sales or double stock deductions.
- Sync conflicts are visible and actionable.
- Offline-created sales appear in admin dashboard after successful sync.

## Test Plan
- Run `bun run typecheck`.
- Add or run unit tests for queue serialization, idempotency, and conflict cases.
- Manually simulate offline mode in browser/devtools: create sale, reload, reconnect, and verify one synced sale.
- Manually test failed sync and retry state.

## Brain Update Requirements
- Update `brain/system/architecture.md`, `brain/modules/pos-cashier.md`, and create/update an offline sync feature doc.

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
- Offline stock availability may differ from server truth after other assignments or admin adjustments.
- Stale prices may require honoring price-at-sale versus forcing sync conflict.
- Device clock drift can affect effective price and session timestamps.

## Open Questions
- TODO: Confirm whether stale offline prices should be honored for sales already made.
- TODO: Confirm whether web PWA offline support is enough for MVP.

## Linked Task
- Task Title: Offline-First Sales Sync
- Task File: brain/tasks/roadmap.md
