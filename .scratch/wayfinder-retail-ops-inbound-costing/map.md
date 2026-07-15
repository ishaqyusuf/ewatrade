## Destination

Find the spec boundary for Retail Ops inbound costing and business-account switching/billing hardening. The way is clear when the team can write an implementation spec for a user who belongs to one business and owns another to switch/create businesses, for subscriptions to remain billed per business/tenant, and for supplier-purchase plus production-batch inbound records to calculate landed unit cost, optional markup/selling price, and stock posting through the existing ledger.

## Notes

- Planning only. This map should resolve decisions and produce a spec-ready route, not implement the feature.
- Use this scratch directory: `.scratch/wayfinder-retail-ops-inbound-costing/`. Do not use any draft folder for this effort.
- Overlap audit: [Existing Feature Overlap Audit](overlap-audit.md).
- Existing multi-business work should be extended, not duplicated. Reuse the current `Tenant`, `Membership`, `Store`, active-tenant, active-store, and business switcher directions.
- Existing subscription work should be extended, not duplicated. The user's direction is that each business/tenant is billed separately. Cross-business discounts are future pricing work, not the first inbound-costing spec.
- Existing stock intake and stock ledger work should be extended, not duplicated. The new inbound feature should create richer costing records that later post into `StockDelivery`, `StockDeliveryLine`, `InventoryMovement`, `InventoryItem`, and price/cost history as appropriate.
- Relevant Brain docs: `.brain/plans/2026-07-06-feature-multi-business-signup-and-onboarding.md`, `.brain/plans/2026-07-06-feature-saas-subscription-packaging.md`, `.brain/plans/2026-07-06-feature-stock-intake-and-unit-conversion-ledger.md`, `.brain/features/retail-ops-sales-product.md`, `.brain/modules/merchant-system.md`, `.brain/database/schema.md`, `.brain/api/endpoints.md`, `.brain/api/contracts.md`, and `.brain/api/permissions.md`.
- Domain language: `Tenant` is the billed business account, `Store` is the operating store/workspace inside the tenant, `Product` and `ProductVariant` are catalog records, `InventoryItem` is current stock, and ledger records explain why stock changed.

## Tickets

- [ ] [Validate dual-role business switching and per-business billing gaps](01-dual-role-business-switching-billing-gaps.md)
- [ ] [Decide inbound record lifecycle and terminology](02-inbound-lifecycle-terminology.md)
- [ ] [Decide supplier purchase landed-cost allocation](03-supplier-purchase-landed-cost-allocation.md)
- [ ] [Decide production batch costing model](04-production-batch-costing-model.md)
- [ ] [Decide catalog cost, selling price, and markup behavior](05-catalog-cost-selling-price-markup.md)
- [ ] [Decide schema and stock-ledger integration](06-schema-stock-ledger-integration.md)
- [ ] [Prototype inbound creation and review UX](07-inbound-creation-review-ux-prototype.md)
- [ ] [Decide permissions, entitlements, reporting, and audit boundary](08-permissions-entitlements-reporting-audit.md)
- [ ] [Write final implementation spec and handoff tickets](09-final-spec-and-handoff-tickets.md)

## Decisions so far

No tickets have been resolved yet.

## Not yet specified

- Whether the first inbound surface is dashboard-first, mobile-first, or split with dashboard for complex costing and mobile for receive/review.
- Whether supplier purchase and production batch share one `Inbound` model with modes, or use separate models behind one UI section.
- Whether MVP supports foreign-currency supplier prices, exchange rates, customs/duties, taxes, and currency conversion, or assumes all costs are entered in the business currency.
- Whether additional costs are allocated by quantity, product value, weight/volume, manual split, or a smaller MVP set.
- Whether final selling prices are suggestions only or can be applied directly to product units with price-history entries.
- Whether cost history should be durable on product units, inbound lines, inventory movements, or a dedicated cost layer.
- Whether partial receipts, over/under delivery, damaged inbound items, and supplier returns are MVP or follow-up.
- Whether production batch costing must support multiple output products, waste/byproducts, reusable recipes/BOMs, or only one output product with simple cost division in v1.
- Exact database migration sequence, API procedure names, mobile/dashboard screen map, and validation test plan.

## Out of scope

- Rebuilding the existing multi-business switcher from scratch.
- Replacing the existing tenant-level subscription foundation.
- Implementing cross-business discounts in the first spec. Keep a placeholder for future pricing policy only.
- Building payable provider checkout, Stripe/App Store/Play Store adapters, or provider-native billing reconciliation inside this map.
- Replacing the existing stock ledger or sale price history model before the inbound costing boundary is decided.
- Full ERP purchasing, supplier payment accounting, accounts payable, warehouse management, MRP, advanced BOM routing, landed-cost accounting compliance, or tax filing workflows.
- Implementing schema, APIs, mobile/dashboard screens, migrations, or billing changes inside this Wayfinder map.
