# 03 - Decide Product, Unit, Variant, And Sellable Option Language

## Question

What domain language and data shape should distinguish item, default unit, variant label, variant value, and sellable price/stock row?

**Type:** Research / domain modeling.

**Blocked by:** None.

## Resolve By

- Decide user-facing terms for merchant UI: item, unit, variant, option, value, size, color, and price row.
- Map those terms to current schema concepts: `Product`, `ProductVariant`, `ProductUnitTemplate`, `ProductUnitTemplateUnit`, `InventoryItem`, and `ProductUnitPriceHistory`.
- Decide whether one variant dimension can be represented by current `ProductVariant` rows and whether multiple dimensions require generated combinations.
- Decide whether unit-like values such as Bag, Half bag, Quarter, and Kg are modeled as variant values, product units, or a specialized unit variant dimension.
- Decide the minimum compatibility rule for existing sale, stock, price-history, unit-conversion, share-link, closeout, and report surfaces.

## Context

Examples from the user span feed sellers and dry-cleaning services. Rabbit Feeds uses a default unit Bag and Size-like sellable names such as Bag, Half Bag, Quarter, and Kg. Dry cleaning uses Size with SM/LG prices for service items. The spec needs a language model that handles both without confusing merchants or breaking the current product-unit foundation.

## Resolution

The merchant UI uses `item`, `default unit`, `variant`, and `variant value`. The backend keeps the current bridge: item maps to `Product`, default unit and sellable values map to `ProductVariant`, stock maps to `InventoryItem`, and prices continue to use existing variant price/history behavior. Multiple variant labels generate sellable combination names while still using `ProductVariant`.
