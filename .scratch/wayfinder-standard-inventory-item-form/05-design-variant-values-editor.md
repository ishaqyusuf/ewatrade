# 05 - Design Variant Values Editor

## Question

How should a selected variant type collect and manage values such as Blue, Green, Purple, SM, LG, Bag, Half Bag, and Quarter?

**Type:** Prototype / grilling.

**Blocked by:** [Design variant type search and creation modal](04-design-variant-type-search-and-creation-modal.md).

## Resolve By

- Decide the header pattern, such as `Color Variants (x)` with Save.
- Decide empty state copy and centered placement when no values exist.
- Decide bottom input behavior with a rounded plus button to add values.
- Decide horizontal scrollable badges for added values and whether badges are editable, removable, reorderable, or only selectable.
- Decide enabled switch behavior per value before save and after returning to the item form.
- Decide duplicate detection, normalization, capitalization, and maximum value limits.

## Context

The user described a values screen with no tab triggers but a conceptual `variants` and `variant-values` step. When empty, it shows a centered empty message. Once values exist, the UI shows values as horizontal badges and each value can be enabled or disabled.

## Resolution

Implemented as a second full-height modal with a `{Variant} Variants (x)` header, Save action, centered empty state, added-value badges, per-value enabled switches, and a bottom input with rounded plus button.
