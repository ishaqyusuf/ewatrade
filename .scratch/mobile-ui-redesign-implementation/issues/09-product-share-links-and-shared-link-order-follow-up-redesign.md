# 09 — Product Share Links And Shared-Link Order Follow-Up Redesign

**What to build:** redesigned product share workflow: create/copy/share link, generated-link list, analytics, active/inactive status, deactivate action, incoming order requests, payment/fulfillment follow-up, and delivery/order timeline visuals.

**Blocked by:** 01 — Mobile Design Foundation And Reusable Primitives; 02 — Floating App Shell And Role-Aware Navigation; 06 — Create Sale And Checkout Redesign; 07 — Product And Inventory Management Redesign

**Status:** implementation-complete

- [x] Product share creation is available from product surfaces where permissions allow.
- [x] Copy/share feedback is immediate, clear, and compatible with native sharing.
- [x] Generated-link rows show product, creator, status, views, orders, and last activity.
- [x] Link analytics use compact cards and status chips aligned with the redesign.
- [x] Deactivation is clear, safe, and visually distinct from ordinary link actions.
- [x] Shared-link order follow-up shows customer, product, payment, fulfillment, delivery/order timeline, and completion/cancel actions.
- [x] Loading, empty, inactive-link, notification-status, and error states are covered.

## Implementation Notes

- Product share selection now uses `InventoryProductCard` so product rows share the same no-image, selected-state, price, and unit/variant treatment as inventory screens.
- Share link analytics, active/inactive link status, reservation status, notification status, and delivery status now use shared `StatusBadge` treatment.
- Link generation fallback, notification failure, analytics loading/error/offline, order loading/error/offline, delivery loading/error/offline, and mutation failure states use shared `StatusBanner` or `EmptyState` primitives.
- Native share, copy feedback, production link creation/deactivation, local share-link fallback, order completion/cancel, payment/fulfillment options, and delivery request creation/update behavior are preserved.
