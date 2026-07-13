# 06 — Create Sale And Checkout Redesign

**What to build:** the redesigned core POS workflow: product/variant list, display-only parent rows, selectable variants/primary units, quantity stepper with numeric keyboard, total preview, customer lookup/new customer, cash/transfer selection, insufficient-stock states, checkout confirmation, and sale success.

**Blocked by:** 01 — Mobile Design Foundation And Reusable Primitives; 02 — Floating App Shell And Role-Aware Navigation; 05 — Owner And Attendant Dashboard Redesign

**Status:** implementation-complete

- [x] Create-sale is reachable from the redesigned shell and dashboard quick actions.
- [x] Product rows are scannable, with display-only parent rows when variants exist and selectable rows for sellable units.
- [x] Quantity stepper supports plus, minus, and numeric keyboard entry with a nearby total preview.
- [x] Customer lookup and new-customer entry fit inside the sale flow without slowing checkout.
- [x] Cash and transfer payment choices are clear and quick to select.
- [x] Insufficient stock, offline sale, loading, error, and success states are covered.
- [x] The flow is usable one-handed and remains keyboard-safe on compact phones.

## Implementation Notes

- `CreateSaleSheet` now reuses the shared mobile `StatusBadge`, `StatusBanner`, and `EmptyState` primitives for stock, customer, source, session, submit, and empty-product states.
- The sale product list keeps `BottomSheetSectionList` virtualization, display-only parent rows, selectable primary/variant rows, and compact stock context.
- Quantity, total preview, cash/transfer selection, customer book selection, and typed new-customer entry remain in the checkout step with the existing `QuantityStepper` and keyboard-aware sheet behavior.
- Production sale creation, rep session validation, local/offline fallback recording, insufficient stock checks, and sync queue behavior are preserved.
