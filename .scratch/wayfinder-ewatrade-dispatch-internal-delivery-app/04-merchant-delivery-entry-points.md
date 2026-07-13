## Parent map

[Wayfinder: Ewatrade Dispatch Internal Delivery App](map.md)

## Type

grilling

## Status

resolved

## Blocked by

- [Decide Ewatrade Dispatch app identity and v1 product boundary](01-app-identity-v1-product-boundary.md)
- [Research current fulfillment bridge for Dispatch app reuse](02-current-fulfillment-bridge-research.md)

## Question

Where should merchants and staff create delivery requests in v1 across Product Sales, Dry Cleaning/Laundry, and future business templates?

Resolve delivery option placement during order creation, after order/service readiness, inside customer notifications, from shared/request links, and from follow-up screens. Decide which data every delivery request needs from the source workflow and how the UI should avoid overloading sales or dry-cleaning staff.

## Resolution

- Product Sales should create delivery requests from order follow-up and post-sale/order detail surfaces, not from the fast in-person sale path by default.
- Shared product links keep the current delivery follow-up entry point, then graduate into the shared dispatch request boundary.
- Dry Cleaning/Laundry should offer delivery at service-order creation for pickup requests, again when marking service ready, and from the service-order detail screen.
- Customer notifications may include "request delivery" or delivery-tracking links, but staff-owned confirmation remains inside merchant/admin workflows.
- Every delivery request needs source type/id, tenant/store, customer name/phone, pickup contact/address, dropoff contact/address, requested time window when known, package/order summary, payment/amount due summary, delivery-fee responsibility, notes, and customer-safe tracking token.
- UI rule: keep the primary sales/service form focused. Show delivery as a compact optional step or follow-up action, then move detailed pickup/dropoff editing into a dedicated sheet.
- Future templates should integrate through the same source-to-delivery adapter instead of custom delivery tables per template.
