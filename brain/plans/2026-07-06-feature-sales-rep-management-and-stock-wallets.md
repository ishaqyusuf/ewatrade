# Plan: Sales Rep Management And Stock Wallets

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
- Intake Item: Admin mode, add sales rep, monitor sales, and assign/track rep stock.

## Goal Or Problem
Allow admins to add sales reps, assign stock to each rep, and view each rep's current stock responsibility independently from the central business inventory.

## Current Context
The schema has `User`, `Membership`, and membership roles including cashier/operator. POS sessions exist, but there is no sales-rep profile, stock wallet, or stock assignment flow.

## Proposed Approach
Use tenant membership roles for sales reps/cashiers and add stock wallet semantics that track inventory assigned to each rep. Admins should invite/create reps, assign products/units/quantities, and monitor wallet balances. Assignments should be ledger-backed movements from store inventory to rep custody.

## Implementation Steps
- Decide whether sales reps are a role-only membership or need a dedicated rep profile model.
- Add schema for rep stock wallets or custody balances by tenant, store, user, product, and unit.
- Add inventory movement types for stock assignment and rep return.
- Build admin dashboard UI to add/invite sales reps and manage active/suspended status.
- Build stock assignment UI with product/unit/quantity validation.
- Build rep detail page showing assigned stock, sales today, expected cash, current session, and sync status.
- Enforce tenant and role permissions for rep management and stock assignment.

## Affected Files Or Areas
- `packages/db/prisma/models/base.prisma`
- `packages/db/prisma/models/commerce.prisma`
- `packages/db/prisma/models/pos.prisma`
- `apps/dashboard`
- `apps/pos`
- `brain/api/permissions.md`

## Acceptance Criteria
- Admin can add or invite a sales rep for a tenant.
- Admin can assign stock to a rep by product/unit/quantity.
- Rep stock balances are visible separately from central stock.
- Stock assignment updates are auditable through inventory movements.
- Non-admin users cannot assign stock or manage reps.

## Test Plan
- Run `bun run db:generate`.
- Run `bun run typecheck`.
- Add or run permission tests for rep creation and assignment.
- Manually assign stock and verify central and rep balances.

## Brain Update Requirements
- Update `brain/api/permissions.md`, `brain/database/schema.md`, and `brain/modules/pos-cashier.md`.

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
- A rep may belong to multiple businesses and must not see the wrong tenant's stock.
- Assigned stock and central inventory can double count unless custody movement rules are strict.
- Suspended reps need clear handling for stock still assigned to them.

## Open Questions
- TODO: Confirm whether reps log in with full accounts or can be lightweight PIN/device users in MVP.

## Linked Task
- Task Title: Sales Rep Management And Stock Wallets
- Task File: brain/tasks/roadmap.md
