# Plan: End-Of-Day Closeout And Reconciliation

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
- Intake Item: At the end of the day, sales rep closes account, confirms inventory, declares cash, and admin approves.

## Goal Or Problem
Enable a sales rep to close the day by confirming remaining stock and declaring collected money, while the admin reviews variances between expected and actual inventory/cash.

## Current Context
`CashierSession` has close timestamp and closing float fields, but it does not model product-level closing inventory, expected cash from sales, credit totals, damaged/lost stock, or admin approval.

## Proposed Approach
Add closeout records and line items for stock confirmation, cash/payment declaration, credit sales, losses/damage, and variance resolution. Compute expected closing inventory from opening inventory plus assignments minus sales/losses/returns. Compute expected cash by payment method. Admin approval should finalize or flag the session.

## Implementation Steps
- Add schema for closeout summary, closing inventory lines, payment declarations, and admin approval status.
- Implement expected inventory calculation per session and product/unit.
- Implement expected cash/payment calculation from recorded sales.
- Build rep closeout UI for confirming closing stock, declaring cash/transfer/card totals, credit totals, losses/damage, and notes.
- Build admin review UI showing expected versus declared inventory/cash and variances.
- Add approval/rejection flow with required variance notes.
- Ensure approved closeouts update rep wallet and central reporting consistently.

## Affected Files Or Areas
- `packages/db/prisma/models/pos.prisma`
- `packages/db/prisma/models/commerce.prisma`
- `apps/pos`
- `apps/dashboard`
- `packages/db/src`
- `brain/modules/pos-cashier.md`

## Acceptance Criteria
- Rep can close a session only after recording closing inventory and payment declarations.
- System computes expected closing stock and expected cash/payment totals.
- Variances are shown clearly to rep and admin.
- Admin can approve or reject/flag a closeout.
- Approved closeout produces durable audit data for reports.

## Test Plan
- Run `bun run db:generate`.
- Run `bun run typecheck`.
- Add or run tests for expected inventory/cash calculations and approval state transitions.
- Manually complete a full open-sale-close-approve flow.

## Brain Update Requirements
- Update `brain/modules/pos-cashier.md`, `brain/database/schema.md`, and workflow documentation for daily reconciliation.

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
- Reconciliation math can be wrong if it does not include stock received mid-session, returns, losses, or offline sales.
- Admin approval after offline sync may need to reopen previously reviewed sessions.
- Closing stock by derived units can expose rounding/conversion mistakes.

## Open Questions
- TODO: Confirm whether reps can close with unresolved sync conflicts.

## Linked Task
- Task Title: End-Of-Day Closeout And Reconciliation
- Task File: brain/tasks/roadmap.md
