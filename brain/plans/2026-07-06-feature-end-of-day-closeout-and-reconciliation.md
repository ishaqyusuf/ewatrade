# Plan: End-Of-Day Closeout And Reconciliation

## Type
Feature

## Status
In Progress

## Created Date
2026-07-06

## Last Updated
2026-07-10

## Intake
- Intake File: brain/intake/2026-07-06-sales-management-saas-mvp.md
- Intake Item: At the end of the day, sales rep closes account, confirms inventory, declares cash, and admin approves.

## Goal Or Problem
Enable a sales rep to close the day by confirming remaining stock and declaring collected money, while the admin reviews variances between expected and actual inventory/cash.

## Current Context
`CashierSession` has close timestamp and closing float fields, but it does not model product-level closing inventory, expected cash from sales, credit totals, damaged/lost stock, or admin approval. The mobile MVP now has a local closeout bridge that calculates expected cash/transfer from local sales since the previous closeout and captures declared payment plus closing inventory variances for admin-review handoff.

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

## Progress Notes
- 2026-07-10: Added phase-1 local mobile closeout. The Retail Ops store now persists closeout records with expected cash/transfer, declared cash/transfer, payment variances, closing inventory lines, pending-review status, and pending sync state. The dashboard shows a Day closeout summary, and a keyboard-aware closeout sheet captures payment declarations, closing stock confirmation, variance notes, and pending local sync visibility. Backend closeout tables, admin approval/rejection, stock-loss lines, credit/card methods, durable reports, and tRPC persistence remained pending at that point.
- 2026-07-10: Added the first production close-session bridge. `retailOps.closeSession` closes the acting user's open `CashierSession`, records closing cash, totals linked receipts by payment method, and returns expected cash and variance. Dedicated closeout summary tables, closing inventory lines, non-cash declarations, admin approval/rejection, and durable reconciliation reports remained pending at that point.
- 2026-07-10: Added first-phase offline closeout replay. `retailOps.closeSession` accepts `externalId`, `retailOps.syncEvents` supports `closeout_created`, store metadata keeps applied close-session replay results, and mobile closeouts wait for the production cashier session id before closing it with declared cash.
- 2026-07-10: Added the first production payment-reconciliation read bridge. `retailOps.paymentReconciliation` lists closed cashier sessions for the selected tenant/store range, totals linked receipts by cash/transfer/card/gross, computes expected cash from opening float plus cash receipts, and returns declared closing cash with variance. Non-cash declarations, stock variance lines, admin approval/rejection, and durable closeout summary tables remained pending at that point.
- 2026-07-10: Added the first production closeout review bridge. `retailOps.reviewCloseoutSession` lets sales-management users approve or reject a closed cashier session with an optional note, stores bounded review state in `Store.metadata.retailOps.closeoutReviews`, and returns review state through session and payment reconciliation reads. Durable closeout summary tables, closing inventory lines, non-cash declarations, and correction workflows remained pending at that point.
- 2026-07-10: Added first-phase non-cash closeout declarations. `retailOps.closeSession` now accepts declared transfer, card, and credit amounts, stores bounded metadata-backed declarations, includes pending credit sales in session payment totals, and returns cash/transfer/card/credit variances through close, session-list, and payment-reconciliation reads. Durable closeout summary tables, durable closing inventory tables, stock variances, and correction workflows remained pending at that point.
- 2026-07-10: Added first-phase closing inventory declarations. `retailOps.closeSession` now accepts bounded product-unit count lines, validates the units in the selected store, stores metadata-backed closing inventory declarations, computes variance against the acting user's staff wallet balance when present or central inventory otherwise, and returns those lines through close, session-list, and payment-reconciliation reads. Durable closeout summary tables, durable stock variance tables, and correction workflows remained pending at that point.
- 2026-07-11: Added the durable closeout Prisma source schema and migration foundation. `RetailOpsCloseout`, `RetailOpsPaymentDeclaration`, `RetailOpsStockDeclaration`, and `RetailOpsCloseoutReview` now model closeout status, expected/declared/variance totals, payment declarations by method, opening/closing stock declarations by product unit and stock source, damage/loss quantities, offline replay ids, and approval/rejection/correction review history. Generated Prisma client models and the first durable closeout write/review bridge now exist; conflict review after late offline sync, correction workflows, migration application, and live DB validation remain pending.
- 2026-07-11: Added the first durable closeout repository write bridge. `retailOps.closeSession` now mirrors closed-session results into durable `RetailOpsCloseout`, `RetailOpsPaymentDeclaration`, and closing `RetailOpsStockDeclaration` rows when the closeout migration is available, while preserving metadata fallback. `retailOps.reviewCloseoutSession` now updates the durable closeout status/review snapshot and appends durable `RetailOpsCloseoutReview` history when available. Durable read cutover for sessions/payment reconciliation, opening stock persistence, late-sync conflict review, correction workflows, migration application, and live DB validation remain pending.
- 2026-07-11: Added approved closeout ledger posting. `retailOps.reviewCloseoutSession` now posts approved non-zero closing-stock variances from durable `RetailOpsStockDeclaration` rows into idempotent `InventoryMovement(CLOSEOUT_ADJUSTMENT)` rows with `CLOSEOUT` source, closeout/declaration metadata, central-stock or staff-wallet before/after snapshots, reviewer actor, session reference, and movement group id when the closeout and stock-ledger migrations are available. Durable read cutover, opening stock persistence, late-sync conflict review, correction workflows, migration application, and live DB validation remain pending.

## Linked Task
- Task Title: End-Of-Day Closeout And Reconciliation
- Task File: brain/tasks/roadmap.md
