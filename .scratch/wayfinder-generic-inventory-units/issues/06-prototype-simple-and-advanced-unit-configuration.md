# Prototype Product Units And Service Offerings Configuration

Parent: [Wayfinder: Catalog Variants, Product Units, And Sellable Offerings](../map.md)

Type: prototype

Status: resolved

Blocked by: 02, 03, 04, 05, 12

## Question

What mobile and dashboard experience keeps a normal one-unit Product and a
simple Service easy to create while allowing Product merchants to define custom
units, canonical factors, precision, stock behavior, Product Unit Offerings,
opening balances, and Stock Transformations, and Service merchants to define
priced Service Offerings without stock or industry-specific presets?

## Comments

Prototype two progressively disclosed paths:

- Simple Product: name, canonical unit, price, and optional opening stock.
- Advanced Product: custom units, exact factors, precision, shared versus
  packaged behavior, offering price/SKU/barcode, and opening balances.
- Simple Service: name and price.
- Advanced Service: merchant-defined option combinations and independent
  prices, with no stock controls.

Validate the Product path with a generic bulk-item example supporting whole,
half, quarter, and kilogram sales. Validate the Service path with the
Agbada/Shirt/Trouser/Suit price matrix. Neither example may introduce an
industry type or preset into runtime behavior.

## Approved Direction

- The default Product path asks only for name, canonical unit, Unit Price, and
  optional opening stock/Store.
- Saving the simple path creates the Product, implicit default Sellable Variant,
  one-unit Current configuration, canonical shared Stock Behavior, Product Unit
  Offering, and optional opening Stock Movement.
- Advanced configuration progressively exposes custom definitions, factors,
  Transaction and Canonical Balance Precision, Stock Behavior, internal units,
  SKU/barcode, sale price, Store balances, and exact validation preview.
- Stock Transformations remain operational actions after configuration rather
  than ordinary Product-form fields.
- Platform suggestions remain neutral vocabulary. Industry examples may appear
  in documentation, prototypes, and tests only.

## Resolution

- Use one Create Item flow. The merchant chooses Product or Service first, and
  that Catalog Item kind is immutable after save.
- Keep the default Product form to name, explicitly selected or custom
  Canonical Inventory Unit, Unit Price, and optional Opening Stock. Neutral
  Unit Definition suggestions accelerate selection without supplying an
  industry-specific or universal hidden default.
- Expand Advanced Configuration inside the same unsaved draft. Do not force
  the merchant to create an incomplete Product before defining its real
  structure.
- Order advanced Product setup as Variants, Inventory Units, Sellable
  Offerings, Opening Stock, then Review and Activate.
- Present Variant Option Groups separately from Inventory Units. Remove
  “multiple pricing” behavior that conflates variants, units, and offerings.
- Present Stock Behavior with merchant-facing choices “Uses the same stock
  pool” and “Tracked as separately prepared stock,” while retaining the formal
  domain terms in explanations and audit views.
- Each Inventory Unit has an explicit “Sell this unit” choice. Enabling it
  creates a Product Unit Offering with independent price, optional SKU/barcode,
  and Store availability. Internal and purchasing-only units remain
  unsellable.
- Enter Unit Factors in one direction only: `1 configured unit = X canonical
  units`. Do not expose inverses or chains. Show an exact validation preview.
- Default Transaction Precision to whole quantities. Advanced setup may enable
  decimal quantities and choose the permitted scale; publication calculates
  and proves the required Canonical Balance Precision.
- The simple Product has one Opening Stock field. Advanced Opening Stock is
  entered per Store and actual Balance Source. Alternate Transaction Unit
  entries affect the Shared Stock Pool; Packaged Stock entries affect their
  separate balances.
- A valid simple Product may activate immediately. Advanced configuration can
  save a Draft and requires explicit review and activation. Incomplete Drafts
  cannot participate in sales or stock operations.
- A simple Service creates an implicit default Sellable Variant and one
  fixed-price Service Offering. Advanced Services use merchant-authored
  Variant Option Groups and independent fixed or quote-required prices.
  Services never show Inventory Units, Stock Behavior, Opening Stock, or Stock
  Transformations.

The Agbada/Shirt/Trouser/Suit matrix is represented as Service Variant Option
Groups such as Garment and Size. Generated combinations may be independently
priced, disabled, or quote-required. This is configuration data only and does
not create a dry-cleaning business type.
