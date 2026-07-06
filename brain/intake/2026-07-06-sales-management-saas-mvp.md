# Brain Intake: Sales Management SaaS MVP

## Status
Proposed

## Created Date
2026-07-06

## Last Updated
2026-07-06

## Raw Input
Create a full A-Z implementation plan for a simple SaaS sales management product under ewatrade. The product should support businesses that sell products in flexible units, starting with rabbit feed as the example. Core ideas include signup, onboarding, multiple businesses per account, product and unit setup, reusable unit templates, price history, delivered stock, rebagging into half/quarter units, admin-managed sales reps, rep clock-in and inventory confirmation, sales recording, end-of-day closeout, cash and inventory reconciliation, offline-first usage with online sync, dashboard monitoring, subscription-based SaaS packaging, and a design-system pass informed by strong sales-management app designs before implementation.

## Generated Plans
- [ ] Retail Ops Design System And IA - `brain/plans/2026-07-06-ux-ui-retail-ops-design-system-and-ia.md` - Status: Proposed
- [ ] Multi-Business Signup And Onboarding - `brain/plans/2026-07-06-feature-multi-business-signup-and-onboarding.md` - Status: Proposed
- [ ] Flexible Product Units And Price History - `brain/plans/2026-07-06-feature-flexible-product-units-and-price-history.md` - Status: Proposed
- [ ] Stock Intake And Unit Conversion Ledger - `brain/plans/2026-07-06-feature-stock-intake-and-unit-conversion-ledger.md` - Status: Proposed
- [ ] Sales Rep Management And Stock Wallets - `brain/plans/2026-07-06-feature-sales-rep-management-and-stock-wallets.md` - Status: Proposed
- [ ] Rep Clock-In And Opening Inventory - `brain/plans/2026-07-06-feature-rep-clock-in-and-opening-inventory.md` - Status: Proposed
- [ ] Sales Recording And Payment Capture - `brain/plans/2026-07-06-feature-sales-recording-and-payment-capture.md` - Status: Proposed
- [ ] End-Of-Day Closeout And Reconciliation - `brain/plans/2026-07-06-feature-end-of-day-closeout-and-reconciliation.md` - Status: Proposed
- [ ] Offline-First Sales Sync - `brain/plans/2026-07-06-feature-offline-first-sales-sync.md` - Status: Proposed
- [ ] Retail Ops Dashboard Reports - `brain/plans/2026-07-06-feature-retail-ops-dashboard-reports.md` - Status: Proposed
- [ ] SaaS Subscription Packaging - `brain/plans/2026-07-06-feature-saas-subscription-packaging.md` - Status: Proposed
- [ ] Retail Sales Product Documentation - `brain/plans/2026-07-06-docs-retail-sales-product-documentation.md` - Status: Proposed

## Recommended Execution Order
1. Retail Ops Design System And IA - establish the product workflow, screen map, and UI language before building operational screens.
2. Multi-Business Signup And Onboarding - configure tenant/business context and capture the business setup data needed by later modules.
3. Flexible Product Units And Price History - product/unit/price data is foundational for inventory, sales, reports, and reconciliation.
4. Stock Intake And Unit Conversion Ledger - stock delivery and conversion create the inventory truth used by reps and admins.
5. Sales Rep Management And Stock Wallets - reps need roles, assignments, and inventory ownership before day workflows.
6. Rep Clock-In And Opening Inventory - opening confirmation establishes the daily baseline for selling and reconciliation.
7. Sales Recording And Payment Capture - record the core sale events against product units, prices, and payment states.
8. End-Of-Day Closeout And Reconciliation - compare opening stock, assignments, sales, cash, credits, losses, and closing stock.
9. Offline-First Sales Sync - make the sales flow resilient offline after the online workflow contract is stable.
10. Retail Ops Dashboard Reports - surface daily sales, stock, cash, credit, shortage, and rep performance from stabilized workflows.
11. SaaS Subscription Packaging - package access and limits after MVP business capabilities are clear.
12. Retail Sales Product Documentation - update Brain/product docs across the completed MVP direction.

## Agent Recommendations
- Retail Ops Design System And IA: antigravity - visual exploration and workflow comparison benefit from design-focused iteration.
- Multi-Business Signup And Onboarding: open-code - contained implementation in existing marketing/signup and tenant areas.
- Flexible Product Units And Price History: open-code - schema/API/UI work with clear affected files.
- Stock Intake And Unit Conversion Ledger: open-code - schema-backed domain behavior with observable inventory balances.
- Sales Rep Management And Stock Wallets: open-code - role and inventory assignment flows in dashboard and DB.
- Rep Clock-In And Opening Inventory: open-code - POS/dashboard session flow built on existing cashier session concepts.
- Sales Recording And Payment Capture: open-code - core POS/order implementation with clear acceptance criteria.
- End-Of-Day Closeout And Reconciliation: open-code - deterministic ledger/reconciliation workflow.
- Offline-First Sales Sync: open-code - needs careful client/server contract and conflict tests.
- Retail Ops Dashboard Reports: antigravity - reporting UX and dashboard layout benefit from visual design review.
- SaaS Subscription Packaging: open-code - billing/access control can be implemented as a focused platform slice.
- Retail Sales Product Documentation: open-code - direct Brain documentation update.

## Merged Items
- Rabbit feed app, generic sales management, and reusable unit templates were merged into a flexible-unit retail sales MVP because rabbit feed is best treated as an onboarding/template example rather than a separate product.
- Admin mode, sales rep creation, sales monitoring, clock-in, and stock wallet concepts were split across rep management, opening inventory, sales recording, and closeout plans because each has distinct acceptance criteria.
- Offline feature and online sync were merged into one offline-first sales sync plan because they share client storage, idempotency, and conflict-resolution contracts.

## Duplicate Or Existing Items
- POS and inventory concepts overlap with existing Brain modules `brain/modules/pos-cashier.md` and `brain/modules/merchant-system.md`, but no existing Brain plan covers this specific sales-rep reconciliation MVP.

## Needs Clarification
- Confirm whether the first implementation target is web/PWA only or whether a native mobile app is required for offline reps.
- Confirm billing provider and package limits for subscriptions.
- Confirm whether the first vertical template should be named Rabbit Feed, Animal Feed, or a neutral Bag/Weight retail starter.
- Confirm payment methods and credit-sale approval rules for the initial market.

## Skipped Items
- None.

## Approval Notes
- None.

## Handoff Notes
- Use `brain-batch-handoff` to convert approved plans into handoffs and queue items.
