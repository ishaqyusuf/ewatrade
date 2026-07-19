# Define Product And Service Offering Commercial Semantics

Parent: [Wayfinder: Catalog Variants, Product Units, And Sellable Offerings](../map.md)

Type: grilling

Status: resolved

Blocked by: 02, 03, 12

## Question

Which commercial fields belong to every Sellable Offering, which belong only to
Product Unit Offerings or Service Offerings, and how should SKU, barcode,
independent price, availability, purchase/receive eligibility, internal-only
status, and historical order-line snapshots avoid turning Inventory Units or
Service options back into Sellable Variants?

## Comments

Every Sellable Offering should own display identity, independent price and
currency, active/sale availability, and immutable order-line snapshot
behavior.

Product Unit Offerings additionally own selling-unit reference, optional
SKU/barcode, sale eligibility, and purchase/receive eligibility. Service
Offerings own service options and work-tracking behavior but never stock
fields. Internal-only Inventory Units may exist without a price or Sellable
Offering.

An Inventory Unit does not own price, SKU, or barcode by itself. Historical
order lines snapshot the selected offering name, option labels, unit, price,
quantity, and relevant configuration version.

## Resolution

- Unit Price is commercially independent from Unit Factor. Factor changes never
  recalculate price, and price changes never alter stock meaning.
- Proportional price suggestions may be shown but require explicit merchant
  acceptance.
- Price Change records previous/new price, currency, offering, actor, time,
  optional reason/source, and affects future transactions only.
- Discounts, taxes, promotions, coupons, and negotiated overrides belong to
  Commercial Order pricing and are snapshotted separately from base Unit Price.
- Fixed catalog prices use one Business Currency in v1. Multi-currency catalog
  pricing and automatic exchange conversion are deferred.
- Product Unit Offering is a sale-only commercial subtype. Internal and
  purchase-only Inventory Units may exist without an offering or Unit Price.
- Supplier Pack belongs to a supplier/Product purchasing relationship, maps to
  an existing Inventory Unit, and cannot create or redefine Product units or
  factors.
- Product Unit Offering owns optional business-unique SKU/barcode and sale
  availability. Service Offering may own a business-unique service code but
  cannot acquire inventory fields.
- Commercial Order lines preserve immutable Offering Snapshots, including the
  selected labels, pricing components, Product unit/version meaning, or Service
  policy meaning.
