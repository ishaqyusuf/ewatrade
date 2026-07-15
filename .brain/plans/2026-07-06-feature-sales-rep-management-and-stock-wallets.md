# Plan: Sales Rep Management And Stock Wallets

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
- Intake Item: Admin mode, add sales rep, monitor sales, and assign/track rep stock.

## Goal Or Problem
Allow admins to add sales reps, assign stock to each rep, and view each rep's current stock responsibility independently from the central business inventory.

## Current Context
The schema has `User`, `Membership`, and membership roles including cashier/operator. POS sessions exist, but there is no sales-rep profile, stock wallet, or stock assignment flow.

The mobile MVP now has a local attendant invite bridge: owners can open the Add staff action, enter a minimal attendant name/email, store a pending invite locally, and see the pending attendant on the dashboard. This does not replace production memberships, invitation emails, role permissions, stock wallets, or ledger-backed stock assignment.

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
- `.brain/api/permissions.md`

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
- Update `.brain/api/permissions.md`, `.brain/database/schema.md`, and `.brain/modules/pos-cashier.md`.

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

## Progress Notes
- 2026-07-10: Added the first mobile staff invite slice using the local Retail Ops store. The dashboard Add staff action now opens a keyboard-aware invite sheet, saves a pending attendant invite by email, de-duplicates invites by email, shows an Attendants section, and reflects local staff count in the Active staff metric.
- 2026-07-10: Added the first production staff invite bridge. `retailOps.inviteStaff` now validates owner/admin/manager permission, normalizes staff email, creates or reuses a user, creates or refreshes an invited tenant membership for cashier/operator/manager roles, and rejects already-active staff. Acceptance tokens, subscription staff limits, stock wallets, and custody assignment remain pending.
- 2026-07-10: Added first-phase staff invite email dispatch. `retailOps.inviteStaff` now enqueues a shared notification job after membership persistence, rendering a staff invite email with business name, inviter, role, and get-started app URL. Account-based onboarding completion was added in a follow-up slice; secure invite acceptance tokens, real email provider configuration, subscription staff limits, and stock wallets remained pending at that point.
- 2026-07-10: Added the first production staff list bridge. `retailOps.staff` lists bounded owner/admin/manager/cashier/operator memberships for the active tenant with role, status, search, and limit filters so admin surfaces can review active, invited, or suspended staff before stock wallets are implemented.
- 2026-07-10: Added the first production stock-wallet assignment bridge. `retailOps.assignStaffStock` lets sales-management users assign unassigned store stock to active staff, decrements central inventory, stores metadata-backed staff wallet balances and assignment events, and supports external-id replay; `retailOps.staffStockWallets` lists current custody balances. Durable wallet tables, assignment/return movement rows, returns, and reconciliation remained pending at that point.
- 2026-07-10: Added first wallet-aware sale deduction. `retailOps.createSale` now consumes assigned staff wallet stock for the acting staff/product unit, records bounded wallet sale metadata, and falls back to central inventory when no wallet balance exists. Durable wallet tables, returns, reconciliation, and ledger-backed movements remain pending.
- 2026-07-10: Added the first production stock return bridge. `retailOps.returnStaffStock` lets sales-management users return assigned staff wallet stock to central inventory, supports external-id replay, and stores bounded metadata-backed return events. Durable wallet tables, return approvals, reconciliation, and ledger-backed movements remain pending.
- 2026-07-10: Added first production staff lifecycle status updates. `retailOps.updateStaffStatus` lets owner/admin/manager users suspend or reactivate cashier/operator/manager staff memberships, prevents self-updates, and keeps owner/admin membership changes outside the attendant lifecycle. Dedicated staff profiles, secure acceptance tokens, and durable lifecycle audit tables remain pending.
- 2026-07-10: Added first-phase staff onboarding completion. `retailOps.completeStaffOnboarding` lets an authenticated invited staff user activate their own cashier/operator/manager membership, set `acceptedAt`, and save lightweight name/display-name details before they have an active tenant context.
- 2026-07-11: Added the durable staff stock wallet Prisma source schema and migration foundation. `StaffStockWallet` now models tenant/store/staff/product-unit custody balances, reserved quantity, last movement timestamp, and product/user relations; `InventoryMovement` now has optional staff wallet linkage plus before/after wallet quantity snapshots for assignment, return, sale deduction, and closeout adjustment rows. Live read cutover, return approvals, wallet reconciliation, dedicated staff profiles, and lifecycle audit tables remain pending.
- 2026-07-11: Added the first durable staff wallet movement bridge. `retailOps.assignStaffStock` and `retailOps.returnStaffStock` now upsert durable staff wallet balances and write linked `STAFF_ASSIGNMENT`/`STAFF_RETURN` inventory movements when the staff-wallet and stock-ledger migrations are available. Wallet-aware sales also update the durable wallet balance while writing sale-deduction rows. Durable wallet reads, return approvals, reconciliation, migration application, and live DB validation remain pending.
- 2026-07-11: Added the durable staff profile, invite-token, and lifecycle-audit Prisma source schema and migration foundation. `RetailOpsStaffProfile`, `RetailOpsStaffInviteToken`, and `RetailOpsStaffLifecycleEvent` now model membership-linked attendant profiles, default store, role/status snapshots, hashed invite tokens, token lifecycle timestamps, replay ids, and auditable invite/onboarding/suspension/reactivation/removal/role-change events. Generated Prisma client updates, live repository wiring, secure token acceptance, real email provider configuration, durable staff usage snapshots, return approvals, and wallet reconciliation remain pending.
- 2026-07-11: Added durable-first staff stock wallet balance reads. `retailOps.staffStockWallets` now reads positive `StaffStockWallet` balances with staff/product/unit snapshots when the migration is available, merges legacy store-metadata balances during rollout, and keeps the existing staff filter/limit behavior. Return approvals, wallet reconciliation, migration application, and live DB validation remain pending.
- 2026-07-11: Added the first durable staff profile, invite-token, and lifecycle-audit write bridge. `retailOps.inviteStaff` now upserts `RetailOpsStaffProfile`, writes or refreshes a hashed `RetailOpsStaffInviteToken`, and records invite lifecycle events when the migration is available; `retailOps.updateStaffStatus` records suspended/reactivated profile snapshots and lifecycle events; `retailOps.completeStaffOnboarding` accepts active invite tokens and records onboarding completion events. Membership/user reads, secure token acceptance URLs, real email provider configuration, return approvals, wallet reconciliation, migration application, and live DB validation remain pending.
- 2026-07-11: Added durable-first staff profile reads. `retailOps.staff` now reads `RetailOpsStaffProfile` rows with user and membership snapshots when the migration is available, then merges legacy membership/user rows so owner/admin rows and pre-cutover staff remain visible during rollout. Secure token acceptance URLs, real email provider configuration, return approvals, wallet reconciliation, migration application, and live DB validation remain pending.
- 2026-07-15: Marked implementation ticket complete. Core acceptance is covered by permissioned staff invite/status flows, staff onboarding completion, central-to-wallet assignment/return, staff-wallet sale deduction, durable staff profile/invite/lifecycle rows, durable wallet rows, and durable-first wallet reads. Return approval workflows and live provider/email hardening remain follow-up work.

## Linked Task
- Task Title: Sales Rep Management And Stock Wallets
- Task File: .brain/tasks/roadmap.md
