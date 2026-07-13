# 04 — First Product Setup And Starting Inventory Redesign

**What to build:** a redesigned new-owner first-product setup flow covering item name, unit name, unit price, optional variants/sub-units, variant prices, starting stock, validation, skip/add-more behavior, success state, and keyboard-safe sheet/full-screen treatment.

**Blocked by:** 01 — Mobile Design Foundation And Reusable Primitives; 02 — Floating App Shell And Role-Aware Navigation; 03 — Auth, Signup, OTP, And Business Entry Redesign

**Status:** implementation-complete

- [x] New empty businesses get a clear add-first-item prompt after auth/business entry.
- [x] The first-product flow covers item name, unit name, unit price, optional variants/sub-units, variant prices, and starting stock.
- [x] Variant add-more and skip behavior are clear and lightweight.
- [x] Validation, loading, success, and offline/unavailable fallback states are visually defined.
- [x] Every text and numeric input remains usable with the keyboard open.
- [x] The flow uses shared primitives and avoids bulky one-off component structure.

## Implementation Notes

- First-product setup now uses shared `StatusBadge`, `StatusBanner`, and `QuantityStepper` primitives for step state, online/offline setup state, errors, and starting stock.
- The details step keeps item name, description, primary unit, price, optional image link, unit templates, and optional variants/sub-units with variant prices.
- The variant empty state now clearly explains that users can skip variants and continue with only the primary unit.
- The stock step uses the plus/minus/numeric quantity control for current inventory instead of a plain input.
- Existing production creation, local/offline fallback, opening-stock movement, and sync queue behavior were preserved.
