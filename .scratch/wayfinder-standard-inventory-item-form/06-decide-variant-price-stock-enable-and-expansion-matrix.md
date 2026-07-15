# 06 - Decide Variant Price, Stock, Enable, And Expansion Matrix

## Question

After variants are saved, how should the item form show sellable rows with price, stock, enable switch, and expandable details?

**Type:** Grilling / prototype.

**Blocked by:** [Decide product, unit, variant, and sellable option language](03-decide-product-unit-variant-and-sellable-option-language.md); [Design variant values editor](05-design-variant-values-editor.md).

## Resolve By

- Decide when the single parent price is disabled, hidden, or copied into new variant rows.
- Decide row layout for one variant dimension, such as `Red [price] [stock] [enable] [expand]`.
- Decide row layout for multiple dimensions, such as `Color Red, Size SM [price] [stock] [enable]`.
- Decide how combinations are generated, disabled, deleted, or restored when values are changed.
- Decide what appears inside the expanded details area, including variant image, optional SKU/code, notes, reorder threshold, or conversion metadata.
- Decide how stock entry on creation maps to opening stock movements and how edit-time stock changes route to stock intake/adjustment instead of silently rewriting balances.

## Context

The user wants inline price input per variant row, stock input, enable switches, and an expand/collapse button for more details such as variant images. The current sale and inventory logic already treats selectable product units/variants as stock-bearing rows, so this decision must protect inventory audit behavior.

## Resolution

Implemented inline sellable rows. Single variant labels render one row per enabled value. Multiple variant labels render generated combination rows such as `Color Red, Size SM`. Each row has price, stock, enable switch, expand/collapse, delete/disable behavior, and expandable variant image-link details.
