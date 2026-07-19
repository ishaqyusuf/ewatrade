# Retail Ops Sales Product

## Status

Superseded on 2026-07-19 by the clean generic Catalog, Offering, Inventory,
Commercial Order, and Service Operations implementation. This document is
retained only as historical product discovery and is not an implementation
contract. Runtime behavior is defined by:

- `.brain/features/generic-catalog-inventory-units-stock-operations.md`
- `.brain/features/generic-service-operations.md`
- `.brain/decisions/ADR-0012-generic-service-operations-bounded-contexts.md`
- `.brain/decisions/ADR-0013-generic-catalog-inventory-units-and-stock-operations.md`

Industry examples below are explanatory history only. No feed, bag, dry-cleaning,
or other industry vocabulary is encoded as a product rule or runtime namespace.

## Purpose

Document Retail Ops/Sales as the first focused ewatrade product wedge for small businesses that sell physical inventory through owners, managers, and attendants.

Retail Ops does not replace ewatrade's broader commerce, logistics, storefront, marketplace, and messaging platform direction. It is the first operational product slice that proves daily sales, inventory, staff, customer, offline sync, reporting, and subscription value.

## Positioning

Retail Ops helps a business start selling and tracking stock in minutes.

The product is for merchants who currently rely on notebooks, WhatsApp, memory, and informal attendant reports to answer basic questions:

- What did we sell today?
- Who sold it?
- Which product unit was sold?
- What stock remains?
- How much cash or transfer should we have?
- Did any stock or payment variance happen?
- Which changes are still waiting to sync?

## Historical Starter Example

Rabbit feed, poultry feed, grain, bag, half bag, and quarter bag examples are starter templates because they exercise the hard parts of the domain:

- flexible product units
- variant pricing
- stock conversion and rebagging
- attendant sales
- stock custody and reconciliation
- cash and transfer closeout

The standard feed presets model a sealed 25 kg or 50 kg Bag as the base unit,
with Half bag, Quarter bag, and Kilogram as separate stock buckets. Rebagging is
an explicit conversion between those buckets; selling a smaller unit never
silently consumes a sealed bag.

They are not the entire product boundary. The same model should support foodstuff wholesalers, building materials, cosmetics, pharmacy-adjacent retail where allowed, spare parts, mini-marts, and other inventory-led small businesses.

## Primary Personas

### Owner/Admin

Sets up the business, adds products, defines units and variants, invites staff, reviews sales, shares product links, manages subscription state, and reconciles the day.

### Manager

Runs daily operations and reporting, manages stock and attendants where permitted, but may not own billing or destructive tenant settings.

### Sales Rep/Attendant

Clocks in, confirms opening inventory, records sales, captures customer and payment method, works offline after first login, and participates in closeout.

### Customer

May be captured during in-person sales or through a shared product link. The customer account should eventually work across participating businesses while tenant-specific customer history remains scoped.

## Product Scope

### MVP Must Have

- Splash, login, sign-up, and OTP verification.
- Google/Gmail and email OTP auth paths.
- Minimal owner sign-up fields: name, email, business name.
- Multi-business active workspace selection.
- First product setup with unit, price, variants, and starting stock.
- Standard item setup now follows an inventory-oriented mobile form: item name first, an explicit Multiple pricing choice, optional Add Description disclosure, image capture/gallery card, optional public image-link rows, single-price unit/price/stock fields by default, and per-variant or generated-combination price/stock rows only when multiple pricing is selected.
- Product and variant sales with price snapshots.
- Metadata-backed product unit price changes with price-history entries.
- Durable product-unit and price-history schema foundation for reusable unit templates, conversion ratios, and effective price history.
- Quantity stepper with numeric input and visible total.
- Cash and transfer payment capture.
- Customer name capture and customer book.
- Durable customer-book schema foundation for tenant/store customer profiles, identities, events, and future order linkage.
- Staff invite and attendant onboarding path.
- Durable staff profile, invite-token, lifecycle-audit, and stock-wallet schema foundations.
- Rep clock-in and opening inventory confirmation.
- Stock intake and unit conversion/rebagging ledger.
- Offline banner and local sync queue visibility.
- Day closeout with payment declaration and closing stock variance.
- Product share links for web-first customer order requests.
- Generated-link management with online production link creation, local/offline links, production view/order analytics, active/inactive state, pending requests, paid completion/cancellation follow-up, pickup/delivery outcome capture, first delivery-request create/list/status APIs, and deactivation.
- Durable share-link schema foundation for generated links, event-backed views/orders, order-request attribution, stock reservation, notification audit, and daily analytics rollups.
- Reports for daily sales, stock, payments, reps, variances, and pending sync.
- Three-tier subscription packaging and business-scoped entitlements.

### Active Planning

- Operational lock planning is active through `.scratch/wayfinder-retail-ops-operational-lock/map.md`. The effort covers admin manual close/reopen, scheduled closure windows, sales-rep suspension interaction, local cached lock state, and online/offline enforcement of sales-rep operational writes.

### Later Extensions

- Complete production tRPC workflow APIs beyond the first sale/reporting procedures.
- Ledger-backed stock wallets and custody assignment.
- Credit limits, account balances, approval workflows, automated reminders, and durable aging reports beyond first-phase credit sales, repayment tracking, and due-date aging.
- Barcode scanning and scan price-resolution workflow for missing prices, unknown products, customer/cashier photo capture, admin notification, and unavailable-item states.
- Receipt printing.
- Full dashboard reporting with exports.
- App Store and Play Store billing.
- Native customer browsing and checkout app.
- Direct online payment collection from share links.
- Multi-location transfers.
- Advanced analytics and automation.

## Core Entities

- Tenant/business
- Business membership
- Staff/attendant
- Product
- Product unit or variant
- Price snapshot/history
- Inventory movement
- Stock wallet or custody balance
- Rep/cashier session
- Opening inventory line
- Sale
- Sale line
- Customer
- Closeout
- Closeout inventory line
- Product share link
- Shared-link order request
- Scan resolution request
- Sync event
- Subscription and entitlement snapshot

## Workflow Summary

1. Owner signs up or logs in.
2. System resolves the active business.
3. New business adds first product, unit, variants, prices, and starting stock.
4. Owner invites attendants.
5. Rep clocks in and confirms opening inventory.
6. Rep records sales by selecting product unit/variant, quantity, payment method, and customer.
7. Offline sales and inventory actions queue locally when needed.
8. Owner reviews dashboard, reports, stock movements, customer book, and sync state.
9. Rep or owner closes the day with payment declarations and closing stock.
10. Admin reviews variance and reconciles the day.
11. Owner or rep manages generated product links, reviews link views/orders, follows up on pending link requests, and deactivates stale links.
12. Business monitors plan usage and upgrades when limits require it.

See `.brain/workflows/retail-ops-stock-to-closeout-flow.md` for the detailed operational flow.

## Architecture Expectations

- Mobile UI stays thin and NativeWind-first.
- Input-heavy screens use keyboard-safe screens and bottom sheets.
- Shared pressables/buttons provide haptics and consistent press feedback.
- Production data access uses typed tRPC routers.
- Routers call services; services call repository/query modules.
- Prisma remains the schema source of truth.
- Tenant, role, and entitlement checks happen at API/service boundaries.
- Offline sync uses idempotent event envelopes with tenant, actor, device, dependency, and retry metadata.

Implemented production API slices:

- `retailOps.summary`
- `retailOps.inventory`
- `retailOps.salesByProduct`
- `retailOps.openSession`
- `retailOps.closeSession`
- `retailOps.inviteStaff`
- `retailOps.sharedProduct`
- `retailOps.createSharedProductOrderRequest`
- `retailOps.productShareLinks`
- `retailOps.createProductShareLink`
- `retailOps.deactivateProductShareLink`
- `retailOps.createProduct`
- `retailOps.updateProductUnitPrice`
- `retailOps.recordStockIntake`
- `retailOps.recordUnitConversion`
- `retailOps.createSale`

## Reporting Expectations

Retail Ops reporting should start with operational answers:

- today sales
- sales by attendant
- sales by product and unit
- stock balance by product and unit
- expected cash and transfer
- declared cash and transfer
- closeout variance
- stock movement history
- pending sync and sync failures
- product share-link views and orders
- subscription usage and limits

See `.brain/features/retail-ops-reporting.md` for report definitions.

## Subscription Expectations

Retail Ops should package around business operating limits, not only abstract seats.

Initial plan dimensions:

- businesses/stores
- products
- staff/attendants
- offline devices
- report history
- support level

See `.brain/features/retail-ops-subscription-packaging.md` for tier details.

## Open Questions

- Confirm final public product name and whether "Retail Ops" is customer-facing or internal.
- Confirm whether reps are native-app first, PWA first, or both.
- Confirm final billing provider and whether mobile in-app purchase is required for launch.
- Confirm whether credit sales are MVP or first paid-release scope.
- Confirm GPS/device requirements for rep clock-in.
- Confirm initial industries to use as templates beyond feed/grain examples.

## Related Docs

- `.brain/features/mobile-retail-ops-mvp-spec.md`
- `.brain/features/retail-ops-design-system-and-ia.md`
- `.brain/features/retail-ops-reporting.md`
- `.brain/features/retail-ops-scan-price-resolution.md`
- `.brain/features/retail-ops-subscription-packaging.md`
- `.scratch/wayfinder-retail-ops-operational-lock/map.md`
- `.brain/workflows/retail-ops-stock-to-closeout-flow.md`
- `.brain/modules/merchant-system.md`
- `.brain/modules/pos-cashier.md`
