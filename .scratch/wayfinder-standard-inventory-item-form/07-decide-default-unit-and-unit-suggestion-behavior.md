# 07 - Decide Default Unit And Unit Suggestion Behavior

## Question

How should the default unit field and Add Unit bottom sheet work alongside variant labels and variant values?

**Type:** Grilling / domain modeling.

**Blocked by:** [Decide product, unit, variant, and sellable option language](03-decide-product-unit-variant-and-sellable-option-language.md).

## Resolve By

- Decide whether default unit is mandatory for every inventory item or optional for service-style items.
- Decide the Add Unit bottom sheet layout: horizontal suggestions, input, plus button, save behavior, and duplicate checks.
- Decide which suggestions appear first, such as Unit, Kg, SM, Gram, Bag, Crate, Piece, and business-specific history.
- Decide how selecting a unit template differs from adding a variant type named Size or Unit.
- Decide how default unit affects price labels, stock labels, conversion ratios, reports, and sale row labels.

## Context

The user gave a feed example where item is Rabbit Feeds, default unit is Bag, and a Size-like variant has values Bag, Half Bag, Quarter, and Kg. Existing unit templates already support bag and kilogram presets, but the new UI needs to make the merchant-facing meaning obvious.

## Resolution

Implemented a default-unit field with Add Unit bottom sheet, horizontal suggestions, custom input, rounded plus save, and existing unit-template chips. Default unit remains mandatory for the product setup bridge; unit templates can still seed unit-like variant rows with conversion multipliers.
