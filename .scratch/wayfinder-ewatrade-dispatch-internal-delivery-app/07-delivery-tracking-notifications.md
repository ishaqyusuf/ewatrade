## Parent map

[Wayfinder: Ewatrade Dispatch Internal Delivery App](map.md)

## Type

grilling

## Status

resolved

## Blocked by

- [Decide merchant delivery request entry points across business flows](04-merchant-delivery-entry-points.md)
- [Decide Dispatch mobile job lifecycle](06-dispatch-mobile-job-lifecycle.md)

## Question

What should merchants and customers see once a delivery request exists, and which notifications should be sent at each stage?

Resolve merchant status visibility, customer tracking links, ready-for-delivery upsell messaging, pickup/in-transit/delivered/delayed/failed notifications, privacy boundaries, manual fallback copy, and how tracking should work across Product Sales and Dry Cleaning/Laundry orders.

## Resolution

- Merchants see delivery state on the source order/service-order detail and in a delivery operations list filtered by store/status.
- Customers receive opaque tracking links. Tracking pages show business name, public order/reference label, delivery status, ETA window when available, and support/contact instructions.
- Customer pages must not expose rider phone by default, internal notes, proof photos, merchant payout data, raw ids, or other customer/order records.
- Notifications should fire for request confirmed, rider assigned, picked up, out for delivery/in transit, delivered, delayed/failed, and cancelled.
- Dry Cleaning ready notifications can include a delivery CTA before request creation; Product Sales follow-up can include delivery tracking after request creation.
- Every notification template needs manual copy/share fallback for WhatsApp/SMS before provider adapters are live.
- Cross-template tracking uses the same delivery token and status model, with source-specific labels only in customer-facing copy.
