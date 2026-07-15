# Plan: Rep Clock-In And Opening Inventory

## Type
Feature

## Status
Done

## Created Date
2026-07-06

## Last Updated
2026-07-15

## Intake
- Intake File: .brain/intake/2026-07-06-sales-management-saas-mvp.md
- Intake Item: At the beginning of the day sales rep clock in and confirm inventory.

## Goal Or Problem
Require each sales rep to start the day by clocking in and confirming opening inventory so the business has a trusted baseline for sales and end-of-day reconciliation.

## Current Context
The POS schema includes `CashierSession` with open/close timestamps and cash float fields. It does not track opening stock confirmation by product/unit or rep location/device context.

The mobile MVP now has a local rep-session bridge: the dashboard can open a keyboard-aware clock-in sheet, confirm opening stock per product/unit/variant, record variances, show currently clocked-in reps, require the current attendant to clock in before sales can complete, and close the local session when that attendant submits a closeout. This does not replace production POS session schema, server idempotency, location/device capture, role permissions, or admin approval workflows.

## Proposed Approach
Extend POS/cashier session behavior for sales reps. Opening a session should capture confirmed stock counts by product/unit, optional notes, and variance from assigned wallet balances. Admins should see who is clocked in and whether opening stock matched expected quantities.

## Implementation Steps
- Extend or add schema for session opening inventory lines.
- Add session fields for rep clock-in context if needed: location, device id, sync state, and confirmation status.
- Build rep/POS UI for opening a day/session and confirming stock balances.
- Show expected assigned stock beside editable confirmed counts.
- Record variance notes when confirmed stock differs from expected stock.
- Build admin dashboard status view for clocked-in reps and opening variances.
- Prevent normal sales recording until required opening inventory is confirmed.

## Affected Files Or Areas
- `packages/db/prisma/models/pos.prisma`
- `packages/db/prisma/models/commerce.prisma`
- `apps/pos`
- `apps/dashboard`
- `.brain/modules/pos-cashier.md`

## Acceptance Criteria
- Rep can clock in and confirm opening inventory by product/unit.
- Session stores opening stock snapshot and timestamp.
- Variances between expected and confirmed opening inventory are visible to admin.
- Rep cannot proceed to sales if required opening confirmation is incomplete.
- Admin can monitor currently clocked-in reps.

## Test Plan
- Run `bun run db:generate`.
- Run `bun run typecheck`.
- Add or run session tests for open session, duplicate open prevention, and variance calculation.
- Manually clock in as a rep and verify admin visibility.

## Brain Update Requirements
- Update `.brain/modules/pos-cashier.md`, `.brain/database/schema.md`, and related workflow docs.

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
- Reps may forget to close a prior session before opening another.
- Offline opening confirmation must reconcile later without duplicating sessions.
- Variance workflows should not block legitimate admin-approved selling forever.

## Open Questions
- TODO: Confirm whether clock-in requires GPS/location capture.

## Progress Notes
- 2026-07-10: Added the first mobile local rep clock-in slice. The Retail Ops store now persists rep sessions with opening inventory snapshots, variance counts, pending sync state, and sale linkage. The dashboard shows a Rep sessions admin status card, the clock-in sheet captures confirmed opening stock, the New sale path routes through clock-in when needed, and sale creation is guarded until the current attendant has an open session.
- 2026-07-10: Added the first production session lifecycle bridge. `retailOps.openSession` opens a `CashierSession` for the acting user/store with opening float and duplicate-open prevention. First-phase opening inventory lines and variance snapshots were added in a follow-up slice; device/location context remains pending.
- 2026-07-10: Added first-phase production opening inventory declarations. `retailOps.openSession` now accepts bounded product-unit count lines, validates the units in the selected store, stores metadata-backed opening inventory declarations, computes variance against the acting user's staff wallet balance when present or central inventory otherwise, and returns opening inventory through open, session-list, and payment-reconciliation reads.
- 2026-07-10: Added first-phase offline clock-in replay. `retailOps.openSession` accepts `externalId`, `retailOps.syncEvents` supports `rep_session_opened`, store metadata keeps applied open-session replay results, and mobile stores the returned production cashier session id for sale replay attribution.
- 2026-07-10: Added the first production session-list read bridge. `retailOps.sessions` lists bounded open, closed, or all cashier sessions with rep identity, receipt totals, expected cash, and variance summary for the selected tenant/store range.
- 2026-07-10: Added role-aware session mutation enforcement. `retailOps.openSession` and `retailOps.closeSession` now require a POS-capable role (owner, admin, manager, cashier, or operator) before resolving store scope or writing session state.
- 2026-07-15: Marked implementation ticket complete. Core acceptance is covered by local and production session open flows, duplicate-open prevention, opening inventory declarations, variance calculation, admin session reads, sale gating, external-id replay, and POS-capable permission enforcement. GPS/device fingerprint requirements remain an open product decision.

## Linked Task
- Task Title: Rep Clock-In And Opening Inventory
- Task File: .brain/tasks/roadmap.md
