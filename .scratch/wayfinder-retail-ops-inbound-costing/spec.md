# Spec: Retail Ops Inbound Costing, Business Switching, and Per-Business Billing

Status: proposed
Source: current conversation and `.scratch/wayfinder-retail-ops-inbound-costing/`
Publishing: local scratch only

## Problem Statement

Retail Ops already supports business-scoped products, stock intake, staff, reports, and subscription foundations, but merchants need a clearer way to operate across multiple businesses from one identity and a richer way to calculate the true cost of stock before it enters inventory.

A user may be invited into one business as a sales rep while also owning another business. That user needs to switch between businesses from their profile/settings, see which business is current, understand their role in each business, and create their own business without inheriting the invited business's permissions or subscription limits.

Owners also need each business they run to be billed separately. A business should have its own plan, usage, entitlements, invoices, and upgrade path. Cross-business discounts can be considered later, but the first product rule is that the tenant/business is the billing boundary.

Finally, simple stock intake is not enough for real merchants. A seller ordering bags, shoes, or other goods from China may know product quantities and supplier prices, but the real unit cost also includes shipping, waybill, clearing, and transport. A producer making bags of rabbit feed may not know a per-bag cost upfront; they know expected output quantity and total raw material, transport, labor, packaging, and manufacturing costs. Retail Ops needs an inbound workspace that calculates landed or production unit cost, suggests selling prices from markup, and posts approved quantities into the existing stock ledger without duplicating the stock system.

## Solution

Add a v1 Retail Ops inbound-costing and business-account hardening feature.

The business-account side extends the existing tenant/store/membership model. Profile or Settings shows all businesses available to the signed-in user, including businesses where they are owner/admin/manager and businesses where they are staff. The user can switch the active business, see their role and current plan for each business, and create a new owned business from the same account. Creating a new owned business must not be blocked by the user's staff-only role in a different business. Each tenant/business resolves subscription state independently.

The inbound side adds a workspace for preparing stock before posting inventory. It supports two v1 modes:

- Supplier purchase: the merchant adds product/unit lines, quantities, supplier costs, and additional landed-cost lines such as shipping, waybill, clearing, transport, packaging, or other fees. The system allocates additional costs across lines, calculates landed unit cost, and optionally suggests a selling price from markup.
- Production batch: the merchant selects one output product/unit, enters expected and produced quantity, adds cost lines such as raw materials, transport, labor, packaging, manufacturing, or overhead, and the system calculates produced unit cost. This is production costing, not a full manufacturing/BOM module.

Inbound records start as drafts, can be costed and reviewed, and only affect inventory after approval/posting. Posting creates or reuses the existing stock delivery, stock delivery line, inventory movement, inventory item, product unit price history, and reporting foundations. Cost and selling price remain separate: landed/production cost is stored as a cost snapshot; markup creates a suggested selling price; applying the selling price requires explicit approval and writes a price-history entry.

## User Stories

1. As a user invited into a business as a sales rep, I want to see that business in my account, so that I can work for it without creating a second login.
2. As a sales rep, I want to see my role in the current business, so that I understand what I can and cannot manage.
3. As a sales rep, I want to create my own business from the same account, so that I can manage my own sales separately.
4. As a sales rep who owns another business, I want to switch between the business where I work and the business I own, so that I can keep each operation separate.
5. As a business owner, I want Settings/Profile to show all businesses I belong to, so that I can quickly choose the active business.
6. As a business owner, I want the current business to be clearly marked, so that I do not record sales, stock, or costs under the wrong business.
7. As a business owner, I want each listed business to show my role, so that I know whether I am owner, admin, manager, cashier, operator, or invited staff.
8. As a business owner, I want to create another business from Settings/Profile, so that I can start managing a separate operation.
9. As a business owner, I want creating my own business to create an owner/admin membership for that new business, so that I can manage it fully.
10. As a business owner, I want business creation to respect the subscription for the business account being created or expanded, not a staff-only business I merely belong to, so that invited work does not block my own business setup.
11. As a tenant admin, I want staff members to switch only into businesses they belong to, so that tenant data remains isolated.
12. As a tenant admin, I want staff-only users to be unable to manage billing for my business, so that billing remains owner/admin controlled.
13. As a business owner, I want each business to have its own subscription, so that plans, invoices, and limits are scoped to the business.
14. As a business owner with multiple businesses, I want one business's plan limit not to affect another business's products, staff, reports, or devices, so that operations remain independent.
15. As a business owner, I want future cross-business discounts to be possible without merging billing records, so that discounts remain pricing policy rather than a data model shortcut.
16. As a business owner, I want to open an Inbound workspace, so that I can prepare incoming stock before it changes inventory.
17. As a business owner, I want to create a supplier-purchase inbound, so that I can track goods ordered from a supplier or website.
18. As a business owner ordering from China, I want to list each product and quantity in the inbound, so that the system knows what I expect to receive.
19. As a business owner, I want to enter supplier unit cost for each inbound line, so that initial purchase cost is captured.
20. As a business owner, I want to add extra cost lines such as shipping, waybill, clearing, transport, packaging, and other fees, so that true landed cost is captured.
21. As a business owner, I want the system to allocate extra costs across product lines, so that each product gets a landed unit cost.
22. As a business owner, I want to choose a simple allocation method, so that the calculation matches my buying situation.
23. As a business owner, I want v1 allocation by quantity, by line value, or manual split, so that common purchase scenarios are covered without turning the app into accounting software.
24. As a business owner, I want the system to handle rounding in currency minor units, so that landed totals still match the entered costs.
25. As a business owner, I want to see supplier subtotal, additional costs, total landed cost, and landed unit cost, so that I can review the numbers before posting.
26. As a business owner, I want to add a profit percentage or markup to landed cost, so that the system can suggest a selling price.
27. As a business owner, I want selling price suggestions to remain suggestions until I approve them, so that stock costing does not silently change my catalog.
28. As a business owner, I want applying a suggested selling price to write price history, so that future reports can explain why the selling price changed.
29. As a business owner, I want landed cost and selling price to remain separate, so that I do not confuse what stock cost me with what I charge customers.
30. As a business owner, I want to save an inbound as a draft, so that I can finish it after getting more supplier or shipping information.
31. As a business owner, I want to edit draft quantities and costs, so that incomplete inbound records remain flexible.
32. As a business owner, I want to review an inbound before stock is posted, so that mistakes do not affect inventory.
33. As a business owner, I want to approve and post an inbound, so that final quantities increase inventory through the stock ledger.
34. As a business owner, I want posted inbound records to be read-only except for explicit correction workflows, so that inventory audit history remains trustworthy.
35. As a business owner, I want to cancel an inbound draft, so that abandoned orders do not affect stock.
36. As a business owner, I want to record partial receipt when not all expected items arrive, so that stock reflects what I actually received.
37. As a business owner, I want under-delivery or over-delivery to be visible in the inbound record, so that I can reconcile supplier issues later.
38. As a business owner, I want an inbound to use existing products and units where possible, so that I do not duplicate catalog entries.
39. As a business owner, I want to create a new product or unit from an inbound when needed, so that first-time supplier purchases can be recorded in one flow.
40. As a producer, I want to create a production-batch inbound, so that I can cost stock I produced rather than bought as finished goods.
41. As a producer of rabbit feed, I want to enter the expected number of bags, so that the system can divide total production cost by output quantity.
42. As a producer, I want to enter produced quantity separately from expected quantity, so that the unit cost is based on what I actually produced.
43. As a producer, I want to enter raw material, transport, labor, manufacturing, packaging, overhead, and miscellaneous costs, so that the full production cost is captured.
44. As a producer, I want raw materials to be free-form cost lines in v1, so that I can use production costing before a full BOM module exists.
45. As a producer, I want the system to calculate production unit cost from total cost divided by produced quantity, so that I can price the output.
46. As a producer, I want waste, rejected output, or quantity variance to be noted, so that production differences are visible.
47. As a producer, I want the resulting output quantity to post into stock after approval, so that finished goods become sellable.
48. As a manager, I want to receive or post approved stock without seeing sensitive margin details where policy hides them, so that staff can help with operations safely.
49. As an owner, I want cost, supplier, markup, and margin data restricted to owner/admin/manager roles by default, so that sensitive business information is protected.
50. As an owner, I want every cost edit, approval, posting, and selling-price application audited, so that I can trace who changed stock cost and price.
51. As an owner, I want inbound records to appear in stock movement history after posting, so that reports explain why inventory increased.
52. As an owner, I want margin reports to use cost snapshots rather than current costs only, so that historical sales remain explainable.
53. As an owner, I want stock valuation to use posted inbound cost layers or snapshots, so that I can estimate the value of remaining stock.
54. As an owner, I want sales reports to keep sale-time selling price snapshots, so that later price changes do not rewrite past revenue.
55. As a manager, I want inbound history filtered by product, supplier/source, status, and date, so that I can find old purchases or production batches.
56. As a business owner, I want inbound costing to reuse existing subscription and tenant boundaries, so that one business cannot see another business's costs.
57. As a business owner, I want advanced inbound features to be plan-limitable later, so that simple costing can stay accessible while heavier workflows can be packaged.
58. As a developer, I want inbound costing to extend the stock ledger instead of duplicating stock intake, so that inventory remains auditable.
59. As a developer, I want inbound costing to use service/repository boundaries, so that calculations, permissions, and persistence do not live in UI components.
60. As a developer, I want idempotent posting, so that poor-network retries do not duplicate inventory increases.

## Implementation Decisions

- The tenant/business remains the billing and authorization boundary. One user identity can have different memberships and roles in different tenants.
- Business switching should extend the existing active tenant, active store, membership, and dashboard/mobile session context rather than introducing a separate account-switching model.
- Settings/Profile should expose a business list that distinguishes current business, owned/admin businesses, staff memberships, invited memberships, and create-business entry points.
- Creating a new owned business from a staff-only account should create a new tenant/business and owner/admin membership for that new tenant. It must not grant owner/admin access to businesses where the user is only staff.
- Each business/tenant resolves `retailOps.subscription`, usage counters, entitlements, checkout intents, invoices, and billing provider events independently.
- Cross-business discounts are out of v1. The model should allow future pricing policy or coupon logic without changing the tenant-level subscription boundary.
- Add a Retail Ops inbound-costing workspace with two v1 modes: supplier purchase and production batch.
- Supplier purchase mode captures product/unit lines, expected quantity, received quantity, supplier unit cost, optional supplier reference, and additional cost lines.
- Production batch mode captures one output product/unit in v1, expected quantity, produced quantity, rejected/waste quantity, and free-form cost lines.
- V1 production costing is not a BOM or manufacturing-resource-planning module. Raw materials are free-form cost lines unless a later spec links them to inventory consumption.
- Inbound records should have a clear lifecycle: draft, costed/review, approved, posted, cancelled. Partial receipt can be represented before posting when actual received quantity differs from expected quantity.
- Draft records can be edited. Approved or posted records require explicit correction flows rather than silent mutation.
- Inventory must not increase while an inbound is only a draft or costed record. Inventory increases only when an approved inbound is posted.
- Supplier-purchase additional costs should support quantity-based, line-value-based, and manual allocation in v1.
- Weight/volume allocation, customs/tax accounting, foreign-currency exchange-rate workflows, and complex import accounting are deferred.
- Allocation and rounding should be stored as auditable snapshots so totals reconcile to entered cost lines in minor currency units.
- The calculated landed or production unit cost should be stored as an inbound-line cost snapshot and available to margin/reporting workflows.
- Cost price and selling price are separate concepts. Inbound costing can suggest a selling price from markup, but applying that price requires explicit approval.
- Applying a suggested selling price should write a price-history entry using the existing product-unit price history direction, with a source/reason tied to inbound costing.
- Historical sale rows must continue to use sale-time price snapshots. Inbound cost changes must not recalculate old revenue.
- The feature should introduce costing records for draft/review/allocation/approval while reusing existing stock posting primitives for final inventory effects.
- `StockDelivery`, `StockDeliveryLine`, `InventoryMovement`, `InventoryItem`, product variants, and price history remain the preferred posting and audit primitives unless implementation research proves a missing field is required.
- Inbound posting should create or link stock delivery and movement rows, including source references back to the inbound record and line.
- Inbound posting must be idempotent by tenant/store and client/server external id so retries cannot post stock twice.
- Cost-sensitive data, including supplier costs, allocated costs, landed cost, production cost, markup, and margin, should be owner/admin/manager visible by default.
- POS-capable staff may receive or post approved stock only if permitted, but cost and margin visibility should remain restricted unless a later permission setting opens it.
- Inbound reports should feed stock movement history, stock valuation, landed-cost variance, production-cost history, supplier/source history, and gross-margin reporting.
- Inbound creation should be dashboard-first for dense costing and review, while API contracts should allow mobile surfaces to list, review, or receive/post approved inbounds later.
- Business switching and current-business context should appear at the top of the inbound creation/review flow to reduce accidental posting to the wrong tenant/store.
- The implementation should follow existing ewatrade layering: client UI calls typed API procedures, API procedures call services, services call repository/query modules, and tenant/role/subscription checks happen before writes.
- Prisma remains the schema source of truth. Drizzle/runtime query helpers must not become a second schema authority.
- Brain documentation must be updated during implementation for feature behavior, database schema, relationships, API endpoints/contracts/permissions, and tasks.

## Testing Decisions

- The primary testing seam should be the highest stable existing seam: Retail Ops tRPC/API procedures backed by service/repository tests. UI tests should be added only where the user-observable switching or inbound flow cannot be protected through API/query tests.
- Tests should assert external behavior and persisted outcomes, not helper structure or UI implementation details.
- Business-switching tests should prove a single user can hold staff membership in one tenant and owner/admin membership in another, switch active business context, and create an owned business without gaining permissions in the invited business.
- Subscription tests should prove each tenant resolves its own plan, usage, entitlements, and checkout intent independently.
- Permission tests should prove staff-only users cannot manage billing or view restricted cost/margin data in another tenant.
- Inbound supplier-purchase tests should prove product lines, additional cost lines, allocation methods, rounding, and landed unit cost totals.
- Inbound production-batch tests should prove expected quantity, produced quantity, cost lines, unit cost calculation, waste/rejected quantity metadata, and output posting behavior.
- Posting tests should prove inventory is unchanged before posting and increases only after approved posting.
- Ledger tests should prove posting creates or links stock delivery lines and inventory movements without bypassing tenant/store scoping.
- Idempotency tests should prove repeated posting attempts with the same external id return the original result without duplicating stock movements.
- Price tests should prove markup suggestions do not change selling price until approved, and approved selling-price application writes price history.
- Reporting tests should prove inbound-posted stock movements appear in movement history and cost snapshots are available for margin/valuation reports.
- Authorization tests should prove all inbound records, products, stock movements, and cost reports are tenant/store scoped.
- Prior art exists in Retail Ops tests for mobile auth/business context, store creation, subscriptions, stock mutations, stock movement history, price history, sync replay, and dashboard/mobile API boundary guards. New tests should follow those patterns where possible.
- Manual QA should verify the Settings/Profile business list, active-business marker, create-business entry, supplier-purchase inbound flow, production-batch inbound flow, approval/posting, and cost-hidden staff view.

## Out of Scope

- Cross-business subscription discounts, bundles, family plans, or account-level billing aggregation.
- Choosing or integrating the final billing provider, including Stripe checkout, App Store/Play Store billing, provider-native webhooks, payment collection, renewal reconciliation, and invoice payment flows.
- Rebuilding the existing tenant, membership, active-store, subscription, stock ledger, product, price-history, or reporting foundations from scratch.
- Full ERP purchasing, supplier payment accounting, accounts payable, supplier statements, or formal accounting ledger workflows.
- Foreign-currency exchange-rate management, customs/tax accounting, duties, and landed-cost compliance reporting.
- Full manufacturing/BOM support, raw-material inventory consumption, recipe management, multi-output production, byproducts, work orders, machine routing, and production scheduling.
- Warehouse management, put-away, bins, lots/serials, barcode receiving, or multi-location transfer workflows.
- Automatic supplier website import, scraping, purchase-order submission, or supplier integration.
- Automatic price updates without explicit owner/admin/manager approval.
- Exposing cost price, margin, supplier cost, or production cost to sales reps by default.
- Recalculating historical sale revenue from current prices or current costs.

## Further Notes

This spec intentionally extends existing ewatrade Retail Ops concepts instead of duplicating them. Existing work to reuse includes multi-business signup/onboarding, active tenant/store switching, tenant-level subscription packaging, stock intake, stock delivery, inventory movement, product variants, price history, and Retail Ops reporting.

The scratch Wayfinder map remains useful for breaking implementation into smaller tickets, but this spec selects a concrete v1 path from the conversation: per-business billing, profile/settings business switching, supplier-purchase landed cost, simple production-batch costing, explicit approval before stock/price posting, and ledger-backed auditability.
