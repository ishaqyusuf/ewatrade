# Plan: Rep Clock-In And Opening Inventory

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
- Intake Item: At the beginning of the day sales rep clock in and confirm inventory.

## Goal Or Problem
Require each sales rep to start the day by clocking in and confirming opening inventory so the business has a trusted baseline for sales and end-of-day reconciliation.

## Current Context
The POS schema includes `CashierSession` with open/close timestamps and cash float fields. It does not track opening stock confirmation by product/unit or rep location/device context.

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
- `brain/modules/pos-cashier.md`

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
- Update `brain/modules/pos-cashier.md`, `brain/database/schema.md`, and related workflow docs.

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

## Linked Task
- Task Title: Rep Clock-In And Opening Inventory
- Task File: brain/tasks/roadmap.md
