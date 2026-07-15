# 04 - Design Variant Type Search And Creation Modal

## Question

How should the full-screen Add Variant modal search known variant types, suggest past/custom values, and create a new typed result when no match exists?

**Type:** Prototype.

**Blocked by:** [Decide product, unit, variant, and sellable option language](03-decide-product-unit-variant-and-sellable-option-language.md).

## Resolve By

- Decide full-screen modal route/sheet ownership and whether it follows the EwaTrade mobile customer picker, the GND customer selector, or a hybrid.
- Define search states: empty/recent, filtered results, loading, no match, offline fallback, error, and Add "Typed result".
- Decide result sections for system-known variants such as Size and Color, the business's own history, credible cross-business suggestions, and exact typed creation.
- Decide whether selecting a variant type immediately opens values editing in a second modal, or swaps content in the same modal without visible tab triggers.
- Decide how the flow prevents duplicate variant labels and handles label renaming before values are saved.

## Context

The user expects hundreds of known variants, typing-based suggestions, and Add "Typed result" when no item matches. They specifically requested the select customer modal behavior from the GND mobile project. Useful references are EwaTrade `create-sale-sheet.tsx` and `customer-book-sheet.tsx`, plus GND `dealer-customer-selector-dialog.tsx`.

## Resolution

Implemented as a full-height bottom-sheet modal using existing EwaTrade mobile primitives. It searches known variant types, supports typed creation through `Add "Typed result"`, and immediately opens the values editor for the selected label. Durable suggestion search remains a follow-up service boundary.
