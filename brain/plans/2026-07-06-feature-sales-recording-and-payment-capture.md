# Plan: Sales Recording And Payment Capture

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
- Intake Item: Sales rep records sales with product, unit, quantity, price, payment method, customer optional, paid or credit.

## Goal Or Problem
Give reps a fast POS-style flow to record sales by flexible unit while capturing payment method and paid/credit state for later cash reconciliation.

## Current Context
The commerce schema has orders and order items, and POS has receipts and cashier sessions. Retail Ops now has first-phase production sale recording through `retailOps.createSale`, mobile online/offline sale submission, effective price resolution, customer-book capture, credit-sale repayment tracking, and durable sale-deduction inventory movement writes when the stock-ledger migration is available.

The mobile MVP still keeps a local Retail Ops store for first-product setup, customer capture, pending local sales, and stock deduction while offline. Remaining final-plan work includes durable staff-wallet assignment/return repositories, durable stock report reads, approval/override workflows, and live DB validation.

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
- Credit sales now have first-phase repayment tracking, optional due dates, basic aging buckets, and a clear outstanding state; account balances, reminders, credit limits, and approval workflows remain future work.
- Price overrides can weaken reporting if not permissioned and audited.
- Duplicate sale submission is likely in offline/poor-network contexts.

## Open Questions
- TODO: Confirm initial payment methods and whether partial payments are in MVP.

## Progress Notes
- 2026-07-10: Added the first mobile create-sale slice using the local Retail Ops store. The dashboard New sale action now opens a keyboard-aware sale sheet when inventory exists, lists product units or variants directly, uses a plus/minus/numeric quantity stepper, previews the total, captures cash or transfer, captures or reuses a customer name, records a pending local sale, and shows it at the top of Recent sales.
- 2026-07-10: Added the local customer-book slice. Completed sales now update customer last-seen and sale-count metadata, and the mobile dashboard exposes a Customer book section plus searchable customer-book sheet.
- 2026-07-10: Added first-phase customer sync replay. Mobile customer queue events now reference the sale event that produced the customer, and production validates that Retail Ops sale before acknowledging the derived customer-book identity.
- 2026-07-10: Linked local sale creation to the active rep session. The New sale path now requires the current attendant to clock in and confirm opening inventory first, and local sale records store the rep session id for later closeout/session reporting.
- 2026-07-10: Added the first production sale API mutation. `retailOps.createSale` validates product variant/store scope, atomically deducts inventory, creates a completed order and order item with product/unit/price snapshots, creates receipts for paid methods, and records credit sales as completed sales with pending payment.
- 2026-07-10: Added production session lifecycle endpoints that sale creation can use for cashier-session linkage. `retailOps.openSession` creates the acting user's open session, and `retailOps.closeSession` closes it with receipt totals and cash variance.
- 2026-07-10: Added first-phase sale idempotency for poor-network/offline replay. Duplicate `retailOps.createSale` submissions with the same tenant/store `externalId` return the original sale response without a second inventory deduction.
- 2026-07-10: Added the first production customer-book read bridge. `retailOps.customerBook` derives searchable tenant/store customer entries from recent non-cancelled orders by grouping on email, phone, or normalized name. Dedicated customer tables, manual customer upsert, identity merging, and cross-business customer accounts remain pending.
- 2026-07-10: Added the first production credit-sales read bridge. `retailOps.creditSales` returns pending in-person Retail Ops credit sale orders with amount due, customer details, actor display data, payment state, and sale-line snapshots. Basic repayment support and first-phase due-date aging were added in follow-up slices; credit approvals, reminders, and customer balances remain pending.
- 2026-07-10: Added role-aware sale mutation enforcement. `retailOps.createSale` now requires a POS-capable role (owner, admin, manager, cashier, or operator) before resolving store scope or writing sale data.
- 2026-07-10: Added first-phase credit repayment tracking. `retailOps.recordCreditPayment` records cash/transfer/card repayments against pending in-person credit sales, creates receipts, stores bounded repayment events on order metadata, prevents overpayment, updates paid/balance state, and replays offline `credit_payment_recorded` events idempotently.
- 2026-07-10: Added first-phase credit due dates and aging. `retailOps.createSale` accepts optional `creditDueAt` and `creditTermsNote` for credit sales, stores them on order metadata, and `retailOps.creditSales` returns due date, terms note, overdue days, and aging bucket for outstanding credit follow-up.
- 2026-07-11: Added the durable customer-book Prisma source schema and migration foundation. `RetailOpsCustomer`, `RetailOpsCustomerIdentity`, and `RetailOpsCustomerEvent` now model tenant/store customer profiles, email/phone/name/platform-account identities, first/last seen timestamps, order counts, spend totals, merge links, event history, and optional `Order.retailOpsCustomerId` linkage. Generated Prisma client updates are in place; manual customer upsert, identity merge flows, customer balances, and cross-business customer accounts remain pending.
- 2026-07-11: Added the first durable customer-book repository bridge. `retailOps.customerBook` now reads durable customer profiles first and merges order-derived customers as rollout fallback, while offline `customer_upsert` replay writes or updates durable customer, identity, source-order link, and customer-event rows when the migration is available. Manual customer upsert, identity merge flows, customer balances, cross-business customer accounts, and live DB validation remain pending.
- 2026-07-11: Extended the durable customer-book bridge to shared-link order requests. Public shared-link checkout now records customer profiles, email/name/phone identities, optional platform account identities, source order links, and `ORDER_REQUESTED` customer events inside the order-request transaction when the customer-book migration is available.
- 2026-07-11: Added sale-time effective price resolution. `retailOps.createSale` now resolves the product-unit price for `soldAt` from durable price history first, metadata price history second, and current variant price last before calculating order totals, item snapshots, receipts, and response line totals. Live DB validation and effective-price preview UI remain pending.
- 2026-07-11: Added the first durable sale-deduction movement bridge. `retailOps.createSale` now mirrors completed sale lines into `InventoryMovement(SALE_DEDUCTION)` rows with store-stock on-hand snapshots or staff-wallet quantity snapshots when the stock-ledger migration is available. Staff-wallet sales also update the durable `StaffStockWallet` balance when that migration is available. Durable stock reports and live DB validation remain pending.

## Linked Task
- Task Title: Sales Recording And Payment Capture
- Task File: brain/tasks/roadmap.md
