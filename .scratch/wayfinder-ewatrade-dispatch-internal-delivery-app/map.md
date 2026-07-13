## Destination

Find the spec boundary for Ewatrade Dispatch: a separate mobile app and operating workflow for internal, handpicked delivery riders/dispatchers that can receive delivery jobs from Product Sales, Dry Cleaning/Laundry, and later other Ewatrade business flows. The way is clear when the team can write an implementation spec for merchant delivery-request creation, internal dispatcher onboarding/assignment, dispatcher mobile job handling, customer/merchant tracking, and a future path toward verified external dispatch businesses without opening that marketplace in v1.

## Notes

- Planning only. This map should resolve product/domain decisions and produce a spec-ready route, not implement the delivery product.
- The separate mobile app is named **Ewatrade Dispatch**. Merchant/customer copy may still say delivery.
- V1 dispatch is internal-first: only handpicked, approved riders/dispatchers use the dispatch app. External dispatch business or individual self-registration is future scope and must remain gated behind verification/approval decisions.
- Delivery should be requestable from multiple business flows: Product Sales orders, Dry Cleaning/Laundry service orders, service-ready notifications, and later other business templates.
- Existing fulfillment primitives already include `DeliveryRequest`, `DeliveryBid`, `DeliveryAssignment`, `TrackingEvent`, and Retail Ops delivery request APIs around shared-link order follow-up. Future work should reuse or deliberately evolve those boundaries instead of creating a disconnected delivery model.
- Keep merchant/business apps, customer surfaces, and the dispatch app separate enough that daily merchant workflows are not overloaded with rider-only features.

## Tickets

- [x] [Decide Ewatrade Dispatch app identity and v1 product boundary](01-app-identity-v1-product-boundary.md)
- [x] [Research current fulfillment bridge for Dispatch app reuse](02-current-fulfillment-bridge-research.md)
- [x] [Decide internal dispatcher onboarding and approval model](03-internal-dispatcher-onboarding-approval.md)
- [x] [Decide merchant delivery request entry points across business flows](04-merchant-delivery-entry-points.md)
- [x] [Decide dispatch job assignment and operations model](05-dispatch-job-assignment-operations.md)
- [x] [Decide Dispatch mobile job lifecycle](06-dispatch-mobile-job-lifecycle.md)
- [x] [Decide delivery tracking and notifications for merchants and customers](07-delivery-tracking-notifications.md)
- [x] [Decide delivery pricing, fees, payment, and payout boundary](08-delivery-pricing-payment-payout.md)
- [x] [Decide Dispatch app package, auth, and platform boundary](09-dispatch-app-package-auth-platform.md)
- [x] [Decide delivery proof, incident, and accountability controls](10-proof-incident-accountability.md)
- [x] [Decide future verified external dispatcher path](11-future-verified-external-dispatcher-path.md)
- [x] [Prototype merchant-to-dispatch delivery flow](12-merchant-to-dispatch-prototype.md)

## Decisions so far

- V1 is internal-first Ewatrade Dispatch: invite-only approved riders plus an operations assignment surface.
- Delivery requests should reuse/evolve the existing fulfillment boundary instead of creating per-template delivery models.
- Product Sales, Dry Cleaning/Laundry, and future templates create delivery requests through source-specific adapters into one delivery request lifecycle.
- V1 assignment is manual operations-controlled assignment; bidding, provider marketplace discovery, automatic matching, and external self-registration stay hidden.
- Rider mobile owns availability, assigned jobs, status updates, proof, incidents, and queued poor-network event sync.
- Customer tracking uses opaque links and customer-safe status/progress copy.
- Delivery fees are manual or zone-preset in v1, with source workflow payment ownership. Rider payouts remain internal/manual notes.
- Future external provider support is preserved as an admin-gated lifecycle, not exposed as product behavior.

## Not yet specified

- Final implementation spec and delivery milestones.
- Exact Prisma migration sequence for rider profiles, source-polymorphic delivery requests, proof/incident records, customer tracking tokens, and dispatch device/session state.
- Final operations console route map and permissions.
- Final Expo app bundle identifiers, EAS project ids, environment names, and release gates.

## Out of scope

- Implementing schema, APIs, mobile screens, admin console, notification adapters, payment/payout providers, or live dispatch operations inside this Wayfinder map.
- Opening self-serve registration for dispatch companies or independent riders in v1.
- Optimizing multi-rider routing, batching, route planning, live GPS maps, surge pricing, or delivery marketplace bidding unless a decision ticket explicitly keeps a small placeholder boundary.
- Replacing the existing Retail Ops delivery request bridge before its reusable boundaries are understood.
