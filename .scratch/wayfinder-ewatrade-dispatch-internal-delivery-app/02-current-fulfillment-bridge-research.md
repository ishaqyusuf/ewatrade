## Parent map

[Wayfinder: Ewatrade Dispatch Internal Delivery App](map.md)

## Type

research

## Status

resolved

## Blocked by

None - can start immediately.

## Question

What does the current Ewatrade codebase already provide for delivery requests, fulfillment status, assignments, bids, tracking events, Retail Ops shared-link delivery follow-up, customer/merchant notifications, and mobile UI surfaces, and where are the gaps for a separate Ewatrade Dispatch mobile app?

Create a concise linked research summary that identifies reusable schema/API surfaces, likely boundaries to evolve, and risks to avoid before implementation planning.

## Research Summary

Reusable surfaces already exist:

- `packages/db/prisma/models/fulfillment.prisma` has `DeliveryRequest`, `DeliveryBid`, `DeliveryAssignment`, `TrackingEvent`, and `DispatchProviderProfile`.
- `packages/db/src/queries/retail-ops-fulfillment.ts` and `apps/api/src/trpc/routers/retail-ops-share-links.ts` already create/list/status-update shared-link delivery requests.
- `Order` is the current source object for delivery requests through `DeliveryRequest.orderId`.
- `TrackingEvent` can already record status history with optional coordinates and happened-at time.
- `DeliveryAssignment` can already store assigned driver name/phone and picked-up/delivered timestamps.
- Notifications/jobs/email packages already support event payloads and background delivery, which can be extended for delivery status notifications.

Gaps before a separate Dispatch app:

- `DeliveryRequest` is order-only today; Dry Cleaning/Laundry service orders and future service templates need a polymorphic source boundary or shared order abstraction before implementation.
- V1 needs internal rider identity, approval, status, vehicle/service-area metadata, device/session state, and assignment visibility. `DispatchProviderProfile` is tenant-level and provider-oriented, not enough for individual approved riders.
- `DeliveryBid` should remain dormant in internal-first v1. Manual assignment should not accidentally expose marketplace bidding.
- Tracking events need typed event names, proof metadata, incident metadata, actor identity, and customer-safe visibility rules.
- Merchant/customer notification templates and tracking pages are not yet modeled for delivery lifecycle.

Risks to avoid:

- Do not fork delivery models per Product Sales and Dry Cleaning.
- Do not couple the merchant app to rider-only workflow state.
- Do not expose raw request/order ids in customer tracking links.
- Do not treat status text alone as proof; pickup/delivery evidence needs durable audit records.
