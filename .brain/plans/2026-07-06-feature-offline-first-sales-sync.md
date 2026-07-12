# Plan: Offline-First Sales Sync

## Type
Feature

## Status
In Progress

## Created Date
2026-07-06

## Last Updated
2026-07-11

## Intake
- Intake File: .brain/intake/2026-07-06-sales-management-saas-mvp.md
- Intake Item: Offline feature and online sync for sales reps.

## Goal Or Problem
Allow reps to clock in, confirm stock, record sales, and prepare closeout while offline, then safely sync without duplicate sales or silent inventory corruption when connectivity returns.

## Current Context
The app currently has Next.js POS/dashboard surfaces and a growing mobile offline bridge, but the final offline sync architecture still needs production migration validation, automatic/background retry orchestration, and deeper admin resolution workflows.

The mobile MVP now has a local durable queue bridge in the Retail Ops store. Product setup, sale creation, customer upsert, staff invite, share-link creation/deactivation, stock intake, stock adjustment, and unit conversion each create a pending sync event. The mobile dashboard exposes an offline/online banner and sync status sheet with pending event counts, failed-event retry visibility, first-phase retry backoff, local conflict review visibility, dependency-wait visibility, offline device identity, local last-sync telemetry, offline mode toggle, server sync-history visibility, manager-visible server sync conflicts, server-derived resolution guidance, and local synced-state marking. The dashboard Reports screen now surfaces unreviewed server sync conflicts for owner/admin/manager acknowledgement and exports the same resolution guidance. The API now has durable-first offline device registration, listing, revocation, restoration, sync-run history, sync-conflict read/review acknowledgement, resolution guidance, and device entitlement usage when the sync migration is available, with metadata fallback for undeployed environments. This does not replace production migration application, live durable replay validation, automatic resolution mutations, background retry orchestration, or full conflict resolution required by the final plan.

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
- `.brain/system/architecture.md`

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
- Update `.brain/system/architecture.md`, `.brain/modules/pos-cashier.md`, and create/update an offline sync feature doc.

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

## Progress Notes
- 2026-07-10: Added the first mobile local sync-queue slice. Retail Ops local actions now enqueue typed sync events, the dashboard banner reflects offline mode or pending event count, and a keyboard-safe sync status sheet exposes offline mode, queue counts, individual event statuses, and a local mark-synced bridge.
- 2026-07-10: Added first-phase production offline-device registration. `retailOps.registerOfflineDevice` lets a POS-capable tenant member register or refresh an offline-capable device by `deviceId`, stores metadata on the tenant, and enforces the current plan's offline-device entitlement. Production sync replay, idempotency tables, conflict handling, and mobile tRPC wiring remain pending.
- 2026-07-10: Added first-phase sale replay idempotency. `retailOps.createSale` now treats `externalId` as a tenant/store idempotency key and returns the original sale response for duplicate submissions before any stock mutation. Full sync replay endpoints, dependency ordering, conflict handling, and mobile tRPC wiring remain pending.
- 2026-07-10: Added first-phase stock replay idempotency. `retailOps.recordStockIntake` and `retailOps.recordUnitConversion` now treat `externalId` as a tenant/store/type replay key and return the original response before applying another stock balance mutation. Dedicated idempotency tables, database uniqueness, conflict handling, and mobile tRPC wiring remain pending.
- 2026-07-10: Added the first production sync replay endpoint. `retailOps.syncEvents` accepts a bounded batch of offline events, applies supported `closeout_created`, `customer_upsert`, `product_setup`, `rep_session_opened`, `sale_created`, `share_link_created`, `share_link_deactivated`, `staff_invited`, `stock_intake_recorded`, and `unit_conversion_recorded` payloads through existing idempotent mutation helpers, and returns per-event applied/failed/skipped results. Conflict handling, durable sync status storage, and richer dependency review remain pending.
- 2026-07-10: Added the first mobile sync replay wiring. The sync status sheet now builds production replay payloads for supported pending closeout, customer upsert, product setup, rep session open, sale, share-link create/deactivate, staff invite, stock intake, and unit conversion events, calls `retailOps.syncEvents`, stores returned production product/unit/session/share-link/staff membership ids on local records, marks applied events as synced, marks failed events as failed, and leaves unsupported or unmappable events pending. Conflict handling remains pending.
- 2026-07-10: Added idempotent staff invite replay. Offline staff invite sync uses the local event id as `externalId`, stores replay results in tenant metadata, applies staff-management permission checks inside sync, sends the invite email only on first application, and marks the local attendant invite synced with the returned membership id.
- 2026-07-10: Added idempotent share-link replay. Offline share-link create sync uses the local event id as `externalId`, returns an existing generated link on duplicate replay, stores the production link id and URL locally, and waits for that production link id before replaying deactivation. Deactivation replay records its own external id so retries do not move deactivation metadata.
- 2026-07-10: Added idempotent rep-session open replay. Offline clock-in sync uses the local event id as `externalId`, stores replay results in store metadata, returns the original cashier session id on duplicate retry before duplicate-open validation, stores that production session id locally, and makes local sales wait for it before sending `cashierSessionId`.
- 2026-07-10: Added idempotent closeout replay. Offline closeout sync keeps the local rep session id on the closeout, waits for that session's production `cashierSessionId`, sends the closeout as a close-session replay payload with the local event id as `externalId`, and stores close-session replay results in store metadata so retries return the original close result.
- 2026-07-10: Added first-phase customer upsert replay. Offline customer sync sends the local customer with the referenced sale event external id, production validates that the Retail Ops sale exists, and the mobile store marks the local customer plus queue event synced once the derived customer-book identity is acknowledged.
- 2026-07-10: Added first mobile failed-event retry UX. Failed sync results now retain server error code/message and failed time locally, supported failed events are included in the next replay batch, the sync sheet shows "Needs retry" rows with per-event and bulk retry affordances, and the dashboard banner surfaces failed sync work before the sheet is opened.
- 2026-07-10: Added first mobile conflict visibility. Sync results with server error code `CONFLICT` now move into a separate local conflict state, stay out of automatic replay until the operator marks them reviewed, and show review counts in the dashboard, reports, and sync sheet.
- 2026-07-10: Added first mobile dependency-wait diagnostics. Supported pending/failed events that cannot build a production replay payload yet now show specific waiting reasons in the sync sheet, such as product/unit, rep session, sale, or share-link mappings that must sync first.
- 2026-07-10: Added first mobile device-id sync envelope wiring. The Retail Ops store now persists a stable local offline device id, mobile replay sends it as `retailOps.syncEvents.deviceId`, and the sync sheet displays the device identity for operator/debug visibility.
- 2026-07-10: Added first mobile offline-device registration call. Before replaying supported sync events, the sync sheet now calls `retailOps.registerOfflineDevice` with the persisted device id, app version, platform, and device name; registration failures mark attempted events failed with a device-registration message.
- 2026-07-10: Added first local sync telemetry persistence. The mobile store now keeps the latest sync run summary with attempted/completed timestamps, device id, applied/failed/skipped/total counts, status, and request-level error message; the sync sheet displays it after reload.
- 2026-07-10: Added first-phase server sync-run history. `retailOps.syncEvents` now records a bounded tenant metadata sync-run summary after each replay batch, and `retailOps.syncHistory` returns recent runs with POS-safe role scoping so managers can review tenant history while attendants only see their own runs.
- 2026-07-10: Added first mobile server sync-history visibility. The sync status sheet now reads `retailOps.syncHistory` for the current offline device, shows recent production-recorded sync runs with applied/failed/skipped counts and status, and refreshes that history after a successful replay.
- 2026-07-10: Added first mobile retry backoff. Failed sync events now persist a `nextRetryAt` timestamp, automatic replay skips failed events until their retry window opens, the sync sheet shows the next retry time, and the manual retry action clears the delay by moving the event back to pending.
- 2026-07-10: Added first-phase offline device management APIs. `retailOps.offlineDevices` lists current metadata-backed device registrations for managers, and `retailOps.revokeOfflineDevice` removes a registered device so the tenant can free an offline-device slot while live APIs remain metadata-backed.
- 2026-07-10: Added first-phase revoked-device enforcement. Revocation now keeps a bounded metadata tombstone, `retailOps.registerOfflineDevice` rejects revoked device ids, and `retailOps.syncEvents` rejects replay attempts that supply a revoked device id.
- 2026-07-10: Added first-phase revoked-device restore APIs. Managers can list `retailOps.revokedOfflineDevices` and call `retailOps.restoreOfflineDevice` to remove a revocation tombstone so the device can register again through the normal entitlement path.
- 2026-07-10: Added first mobile offline-device management visibility. The sync status sheet now shows manager-only active and revoked device sections when the API permits them, supports revoking non-current devices, and supports restoring revoked devices from the same offline operations surface.
- 2026-07-10: Added mobile report-level sync operations visibility. The Reports sheet now includes connection mode, current device identity, latest local sync summary, and pending/retry/review queue counts so managers can see offline health while reviewing daily sales and stock.
- 2026-07-11: Added mobile stock adjustment replay wiring. The local Retail Ops store now records `stock_adjustment_recorded` events for increase/decrease adjustments, the sync builder sends `retailOps.recordStockAdjustment` payloads with direction, reason, quantity, unit mapping, and event-id idempotency, and blocked adjustments now wait for product/unit mappings the same way stock intake and conversion do.
- 2026-07-11: Added the durable offline sync source-schema and migration foundation. `packages/db/prisma/models/sync.prisma` declares `OfflineDevice`, `OfflineDeviceRevocation`, `RetailOpsSyncRun`, and `RetailOpsSyncEvent`; `packages/db/prisma/models/enums.prisma` declares offline device platform/status and sync run/event status enums; and `packages/db/prisma/migrations/20260711130000_retail_ops_sync_foundation/migration.sql` creates the matching enums, tables, indexes, and foreign keys.
- 2026-07-11: Regenerated the Prisma client for the durable Retail Ops models and switched `retailOps.syncEvents`/`retailOps.syncHistory` to durable `RetailOpsSyncRun` and `RetailOpsSyncEvent` repository reads/writes when the migration is available, with tenant-metadata fallback for undeployed environments. At that point, production migration application, offline-device durable repository cutover, and server-side conflict review were still pending.
- 2026-07-11: Switched offline device registration, active/revoked device listing, revocation, restoration, sync eligibility checks, and offline-device subscription usage to durable `OfflineDevice` and `OfflineDeviceRevocation` rows when the migration is available, with metadata fallback for undeployed environments and transition-time metadata merging. At that point, production migration application, live durable replay validation, and server-side conflict review were still pending.
- 2026-07-11: Added the first server-side sync conflict review bridge. `retailOps.syncConflicts` lists unreviewed failed replay events with error code `CONFLICT` for owner/admin/manager users, and `retailOps.reviewSyncConflict` marks a conflict reviewed. Durable environments use `RetailOpsSyncEvent.reviewedAt`/`reviewedByUserId`; undeployed environments fall back to metadata sync-run summaries plus a bounded reviewed-event-id list. Guided resolution actions, live validation, background retry orchestration, and richer admin resolution queues remain pending.
- 2026-07-11: Added mobile server sync-conflict visibility. The sync status sheet now queries `retailOps.syncConflicts` for the current offline device, shows manager-available server conflicts beside server sync history, and calls `retailOps.reviewSyncConflict` to acknowledge each conflict. Guided resolution actions, live validation, and richer conflict workflows remain pending.
- 2026-07-11: Added dashboard server sync-conflict visibility. The Reports screen now reads unreviewed conflicts, folds them into the Sync issues metric, lists event/device/actor/error details, supports sync-device filtering and CSV export, and calls `retailOps.reviewSyncConflict` for owner/admin/manager acknowledgement. Guided resolution actions, live validation, background retry orchestration, and richer conflict workflows remain pending.
- 2026-07-11: Added first guided sync-conflict resolution actions. `retailOps.syncConflicts` now returns server-derived `resolutionAction` and `resolutionDetail` fields based on the failed event type/error context. The mobile Sync status sheet and dashboard Reports conflict table/CSV now show those actions so managers know whether to review stock, resolve an active session, sync a linked sale, review staff access, or take another business action before acknowledging. Automatic resolution mutations, background retry orchestration, live validation, and richer admin workflows remain pending.

## Linked Task
- Task Title: Offline-First Sales Sync
- Task File: .brain/tasks/roadmap.md
