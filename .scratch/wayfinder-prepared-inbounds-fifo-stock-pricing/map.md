# Wayfinder: Prepared Inbounds And FIFO Stock Pricing

Label: `wayfinder:map`

## Destination

Produce an implementation-ready specification for prepared supplier inbounds,
landed-cost allocation, Store-local FIFO Stock Price Layers, automatic price
activation, mixed-price Commercial Orders, returns, reporting, and equivalent
dashboard/mobile behavior on the current generic inventory architecture.

## Notes

- Planning only. Resolve decisions and prepare the handoff; do not implement
  schema, API, client, migration, or rollout changes while working this map.
- Use `/grilling` and `/domain-modeling` for business-policy decisions. Keep
  [EwaTrade Commerce](../../CONTEXT.md) current whenever terms are resolved.
- Extend the current Catalog, Sellable Offering, Balance Source, Stock
  Reservation, Stock Operation, Stock Movement, Commercial Order, Offering
  Snapshot, and Price Change boundaries; do not restore removed legacy Product,
  ProductVariant, InventoryItem, StockDelivery, or InventoryMovement models.
- Standing decision: one prepared inbound may contain multiple existing Product
  lines plus shared transport or miscellaneous charges. Shared charges default
  to purchase-value allocation with exact, reconciling minor-unit rounding.
- Standing decision: landed cost is distinct from selling price. Each received
  line promotes its latest landed cost for comparison and carries an explicit
  approved price schedule for its Stock Price Layer.
- Standing decision: prepared inbounds use Draft, Ordered, In Transit,
  Received, and Cancelled states. V1 posts the whole inbound atomically when it
  is Received; partial receiving is deferred unless a ticket proves it is
  necessary for correctness.
- Standing decision: full prepared-inbound mutation requires connectivity on
  mobile. The existing offline quick Stock Receipt remains a separate command.
- Standing decision: a Stock Price Layer is local to one Store and Balance
  Source. It carries exact canonical remaining quantity and approved Unit
  Prices for every eligible Product Unit Offering drawing from that balance.
- Standing decision: sales through any eligible Offering consume the shared
  layer FIFO in exact canonical quantity. Layer pricing never implies physical
  lot, serial, bin, or batch separation.
- Standing decision: existing on-hand stock is seeded as the oldest layer using
  current catalog Offering prices. A new layer carries forward unchanged
  Offering prices and replaces only explicitly approved prices.
- Standing decision: a Stock Price Allocation is locked when stock is reserved.
  Cancellation or expiry releases the exact quantities to their original
  layers; payment and fulfillment do not reprice the Order.
- The older [Retail Ops Inbound Costing And Business Account Switching](../wayfinder-retail-ops-inbound-costing/map.md)
  map is historical context only. It mixes billing, business switching, and
  production batches and targets inventory models removed by the generic
  operations cutover.
- Relevant sources include `CONTEXT.md`,
  `.brain/features/generic-catalog-inventory-units-stock-operations.md`,
  `.brain/decisions/ADR-0013-generic-catalog-inventory-units-and-stock-operations.md`,
  `packages/db/prisma/models/catalog.prisma`, inventory and commercial-order
  repositories, inventory/catalog/order API routers, and web/mobile inventory
  and sales surfaces.

## Decisions so far

No child ticket has been resolved yet.

## Not yet specified

- Whether operational scale requires layer compaction, archival, or a bounded
  read model; this becomes precise after the durable allocation model is known.
- Exact production rollout sequencing and fallback behavior until the current
  production migration baseline is audited.
- The final customer-facing wording for mixed-price quantities, receipts, and
  price transitions until promotion, return, and correction policy is fixed.
- Detailed report layouts and retention controls until valuation and audit
  semantics are settled.

## Out of scope

- Business switching, tenant billing, subscription packaging, and
  cross-business discounts.
- Production-batch costing, bills of materials, ingredient consumption,
  manufacturing work orders, byproducts, or production scheduling.
- Supplier payments, accounts payable, accounting journals, tax filing,
  foreign-currency conversion, customs compliance, and supplier integrations.
- Physical warehouse lot, serial, expiry, bin, or traceability management.
- Partial receiving in v1 unless the lifecycle ticket demonstrates that atomic
  whole-inbound receipt cannot satisfy the destination.
- Implementing database, API, dashboard, mobile, migration, or deployment
  changes inside this Wayfinder map.
