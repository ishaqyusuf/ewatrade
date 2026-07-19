# Lock The Generic Catalog, Variant, Offering, And Inventory-Unit Domain

Parent: [Wayfinder: Catalog Variants, Product Units, And Sellable Offerings](../map.md)

Type: grilling

Status: resolved

Blocked by: None

## Question

What are the final entities, relationships, ownership boundaries, and canonical
terms for Catalog Item, Sellable Variant, Sellable Offering, Product Unit
Offering, Service Offering, Unit Definition, product-configured unit, Canonical
Inventory Unit, Shared Stock Pool, Packaged Stock, Alternate Transaction Unit,
and Unit Configuration Version?

## Comments

Adopt these ownership boundaries:

- Catalog Item identifies a Product or Service.
- Sellable Variant represents customer choices such as colour or size—not
  inventory units.
- Sellable Offering is the priced orderable choice.
- Product Unit Offering connects a Product Sellable Variant to a selling unit.
- Service Offering is commercial only and cannot reference inventory.
- Unit Definition is platform or merchant vocabulary without a conversion
  ratio.
- A Product owns one versioned unit configuration and one Canonical Inventory
  Unit.
- Product variants inherit the Product unit configuration in v1; per-variant
  overrides are deferred.
- Alternate Transaction Units use the variant’s Shared Stock Pool.
- Packaged Stock owns a separate balance for that variant and unit.

## Resolution

- A business-owned Catalog Item is permanently a Product or Service after it
  is saved.
- Every Catalog Item has at least one Sellable Variant; simple items use an
  implicit default variant.
- A Product Sellable Variant may have multiple Product Unit Offerings, at most
  one per configured Inventory Unit. Each active Service Sellable Variant has
  one Service Offering.
- Every Product owns one current Unit Configuration Version shared by its
  Sellable Variants. Per-variant unit overrides are outside v1.
- Unit Definitions are vocabulary only. Platform definitions are global
  suggestions; merchant definitions belong to the business.
- Inventory Units contain Product-specific factors, precision, and exactly one
  Stock Behavior. They may be operational without being customer-facing.
- Unit Definition names and symbols are snapshotted into immutable Unit
  Configuration Versions; later rename/archive actions do not rewrite
  configured Products or history.
- Every Product has one Canonical Inventory Unit, which may remain internal.
- Stock balances belong to one Store and Product Sellable Variant. Variants
  never share balances or Stock Transformations.
- Shared Stock Pool, Alternate Transaction Unit, and Packaged Stock behaviors
  are mutually exclusive for a configured Inventory Unit.
- Catalog definitions and prices are business-owned. Store Offering
  Availability and Store stock balances are separate.
- Product Unit Offerings are customer-sale choices. Purchasing and receiving
  operate on Inventory Units and supplier/inbound relationships.
- One Commercial Order may contain Product and Service lines. Composite bundles
  remain outside this first implementation.
- No industry example becomes a runtime Catalog Item kind, unit type, or
  business-specific branch.
