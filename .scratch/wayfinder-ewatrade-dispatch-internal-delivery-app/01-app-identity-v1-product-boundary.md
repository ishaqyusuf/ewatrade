## Parent map

[Wayfinder: Ewatrade Dispatch Internal Delivery App](map.md)

## Type

grilling

## Status

resolved

## Blocked by

None - can start immediately.

## Question

What exactly is the v1 product boundary for the separate delivery mobile app: should it be named Ewatrade Dispatch or Ewatrade Delivery, who uses it, which jobs enter it, and what does internal-first mean operationally?

Resolve whether v1 is rider-only, dispatcher-admin plus rider, or a broader delivery operations app; confirm that only handpicked approved dispatchers can use it; define what must remain in merchant/customer apps versus the separate dispatch app; and mark which future marketplace behaviors are only placeholders.

## Resolution

- Name the v1 app **Ewatrade Dispatch**. "Delivery" remains customer/merchant-facing copy, while "Dispatch" names the internal operations product.
- V1 is an internal rider/dispatcher mobile app plus a small operations/admin console surface. It is not a merchant delivery app and not a public rider marketplace.
- Users are handpicked Ewatrade-approved riders or internal dispatch coordinators. Self-serve rider, courier-company, and external dispatcher signup stays future-gated.
- Jobs may enter from Product Sales shared-link orders, Product Sales/manual orders, Dry Cleaning/Laundry service orders, and future business-template orders through a common `DeliveryRequest` boundary.
- Merchant apps own request creation, delivery-fee visibility, customer handoff copy, and request status review. Customer surfaces own tracking and notification receipt. Ewatrade Dispatch owns rider availability, assigned jobs, status updates, proof, incidents, and operational escalation.
- Dormant marketplace placeholders may exist in model language for dispatch provider profiles, bids, and external provider verification, but v1 UX must hide bidding, public provider discovery, and self-serve onboarding.
