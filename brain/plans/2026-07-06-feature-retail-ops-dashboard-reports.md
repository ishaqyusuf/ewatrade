# Plan: Retail Ops Dashboard Reports

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
- Intake Item: Admin can monitor sales, stock, cash expected, and reports.

## Goal Or Problem
Give owners/admins clear daily visibility into sales, rep performance, stock balances, expected versus received cash, credit sales, shortages, price history, and stock deliveries.

## Current Context
The dashboard app is a scaffolded tenant operations surface. Brain identifies store analytics as a merchant system capability, but there is no Retail Ops reporting suite yet.

## Proposed Approach
Create dashboard reports backed by the stabilized sales, inventory ledger, session, and closeout data. Start with operational daily reports rather than broad BI: today, date range, by rep, by product/unit, stock balance, cash reconciliation, credit, shortage, price history, and delivery/conversion history.

## Implementation Steps
- Define report queries for daily sales, sales by rep, sales by product/unit, stock balance, cash expected versus declared, credit sales, shortages, price history, and delivery history.
- Build dashboard report navigation and filters: business/store, date range, rep, product, and status.
- Add summary cards for sales total, expected cash, declared cash, credit, shortage value, and unsynced events.
- Add tables/charts appropriate for repeated operational use.
- Ensure reports respect tenant and role permissions.
- Add empty/loading/error states and export-ready table structure if feasible.

## Affected Files Or Areas
- `apps/dashboard`
- `packages/db/src`
- `packages/db/prisma/models/commerce.prisma`
- `packages/db/prisma/models/pos.prisma`
- `brain/modules/merchant-system.md`

## Acceptance Criteria
- Admin can view daily sales totals and sales by rep.
- Admin can view stock balances by product/unit.
- Admin can compare expected versus declared cash/payment totals.
- Admin can view credit sales and stock shortage/variance reports.
- Admin can view price history and stock delivery/conversion history.

## Test Plan
- Run `bun run typecheck`.
- Add or run report-query tests with seeded sales/stock/session data.
- Manually verify report totals against a known open-sale-close scenario.

## Brain Update Requirements
- Update `brain/modules/merchant-system.md` and create/update a Retail Ops reporting feature doc.

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
- Reports can disagree if they mix ledger source data and denormalized balances without clear definitions.
- Offline pending sales should be represented separately from synced totals.
- Large date ranges may need pagination or aggregation.

## Open Questions
- TODO: Confirm whether export to CSV/PDF is needed in MVP.

## Linked Task
- Task Title: Retail Ops Dashboard Reports
- Task File: brain/tasks/roadmap.md
