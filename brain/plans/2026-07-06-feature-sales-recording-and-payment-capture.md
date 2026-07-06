# Plan: Sales Recording And Payment Capture

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
- Intake Item: Sales rep records sales with product, unit, quantity, price, payment method, customer optional, paid or credit.

## Goal Or Problem
Give reps a fast POS-style flow to record sales by flexible unit while capturing payment method and paid/credit state for later cash reconciliation.

## Current Context
The commerce schema has orders and order items. POS has receipts and cashier sessions. There is not yet a Retail Ops sale-entry flow that works against rep stock wallets and flexible product units.

## Proposed Approach
Build a rep/POS selling workflow on top of orders/receipts or a dedicated sales record abstraction if required. Each sale line must snapshot product, unit, quantity, unit price, total, rep session, and payment state. Paid and credit sales should be distinguishable for closeout and reports.

## Implementation Steps
- Define how Retail Ops sales map to `Order`, `OrderItem`, and `Receipt`.
- Add missing fields or models for sales channel, rep session, payment method, credit status, customer optional details, and sync idempotency.
- Build POS/rep sale-entry UI with product/unit quick selection and quantity controls.
- Load effective current price from price history and allow authorized price override if permitted.
- Deduct sold quantity from rep stock wallet through ledger movement.
- Capture payment method: cash, bank transfer, POS/card, credit, or TODO: configured methods.
- Generate receipt or sale confirmation where appropriate.

## Affected Files Or Areas
- `apps/pos`
- `apps/dashboard`
- `packages/db/prisma/models/commerce.prisma`
- `packages/db/prisma/models/pos.prisma`
- `packages/db/src`
- `brain/modules/pos-cashier.md`

## Acceptance Criteria
- Rep can record a sale for a product unit and quantity.
- Sale uses the effective price and snapshots the price/unit at sale time.
- Sale deducts stock from the rep wallet, not directly from unrelated reps.
- Payment method and paid/credit status are stored.
- Admin can see sales by rep and session.

## Test Plan
- Run `bun run db:generate`.
- Run `bun run typecheck`.
- Add or run tests for sale creation, price snapshot, stock deduction, and credit sale handling.
- Manually record cash and credit sales and verify rep balances.

## Brain Update Requirements
- Update `brain/modules/pos-cashier.md`, `brain/database/schema.md`, and sales workflow docs.

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
- Credit sales need repayment tracking or at least clear outstanding state.
- Price overrides can weaken reporting if not permissioned and audited.
- Duplicate sale submission is likely in offline/poor-network contexts.

## Open Questions
- TODO: Confirm initial payment methods and whether partial payments are in MVP.

## Linked Task
- Task Title: Sales Recording And Payment Capture
- Task File: brain/tasks/roadmap.md
