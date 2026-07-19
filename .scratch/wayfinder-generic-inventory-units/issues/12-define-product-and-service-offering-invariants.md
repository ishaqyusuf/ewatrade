# Define Product And Service Offering Invariants

Parent: [Wayfinder: Catalog Variants, Product Units, And Sellable Offerings](../map.md)

Type: grilling

Status: resolved

Blocked by: 02

## Question

Which fields and behaviors belong to the shared Sellable Offering, which belong
only to Product Unit Offerings or Service Offerings, how do both relate to
Sellable Variants, and what invariants guarantee that a Service Offering can
never acquire inventory meaning while Product unit configuration remains
independent from customer option dimensions?

## Comments

Keep Sellable Offering deliberately small: orderable identity, display
information, price/currency, availability, and snapshot behavior.

Enforce mutually exclusive Product Unit Offering and Service Offering
subtypes. A Product Unit Offering may reference a Product unit configuration; a
Service Offering must be structurally unable to reference inventory units,
balances, reservations, transformations, stock wallets, or reorder settings.

Sellable Variants describe customer choices. Product unit configuration
describes stock measurement. A colour/size variant may use the Product’s
configured units, but creating an Inventory Unit must never create a Sellable
Variant automatically.

## Resolution

- Sellable Offering is a shared commercial entity with exactly one immutable
  Product Unit Offering or Service Offering subtype.
- Shared fields are stable identity, parent Sellable Variant, optional display
  label, Offering Pricing Policy, business active/archive state, Store
  availability, and audit timestamps.
- Product Unit Offering requires one configured Inventory Unit and may have a
  business-unique SKU and barcode. It owns no factor, precision, Stock
  Behavior, or balance.
- Service Offering may have a business-unique service code and may reference a
  Service Operations policy. It cannot reference inventory or contain Service
  work-instance state.
- Commercial Order lines retain immutable shared and subtype-specific Offering
  Snapshots.
- Referenced offerings may be archived but cannot be deleted or retyped.
- Active Catalog Items and Sellable Variants require valid active offerings;
  incomplete structures remain draft or inactive.
- Product Unit Offerings always use fixed pricing.
- Service Offerings use either Fixed Price or Quote Required. Zero is a real
  free price and never represents an unknown amount.
- Quote Required offerings cannot become Commercial Order lines until an
  approved Quote supplies the immutable negotiated price.
