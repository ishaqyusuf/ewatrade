## Destination

Find the spec boundary for Ewatrade Dispatch: a separate mobile app and operating workflow for internal, handpicked delivery riders/dispatchers that can receive delivery jobs from Product Sales, Dry Cleaning/Laundry, and later other Ewatrade business flows. The way is clear when the team can write an implementation spec for merchant delivery-request creation, internal dispatcher onboarding/assignment, dispatcher mobile job handling, customer/merchant tracking, and a future path toward verified external dispatch businesses without opening that marketplace in v1.

## Notes

- Planning only. This map should resolve product/domain decisions and produce a spec-ready route, not implement the delivery product.
- The app/project name for the separate mobile app is Ewatrade Dispatch or Ewatrade Delivery; naming should be resolved before implementation planning.
- V1 dispatch is internal-first: only handpicked, approved riders/dispatchers use the dispatch app. External dispatch business or individual self-registration is future scope and must remain gated behind verification/approval decisions.
- Delivery should be requestable from multiple business flows: Product Sales orders, Dry Cleaning/Laundry service orders, service-ready notifications, and later other business templates.
- Existing fulfillment primitives already include `DeliveryRequest`, `DeliveryBid`, `DeliveryAssignment`, `TrackingEvent`, and Retail Ops delivery request APIs around shared-link order follow-up. Future work should reuse or deliberately evolve those boundaries instead of creating a disconnected delivery model.
- Keep merchant/business apps, customer surfaces, and the dispatch app separate enough that daily merchant workflows are not overloaded with rider-only features.

## Tickets

- [ ] [Decide Ewatrade Dispatch app identity and v1 product boundary](01-app-identity-v1-product-boundary.md)
- [ ] [Research current fulfillment bridge for Dispatch app reuse](02-current-fulfillment-bridge-research.md)
- [ ] [Decide internal dispatcher onboarding and approval model](03-internal-dispatcher-onboarding-approval.md)
- [ ] [Decide merchant delivery request entry points across business flows](04-merchant-delivery-entry-points.md)
- [ ] [Decide dispatch job assignment and operations model](05-dispatch-job-assignment-operations.md)
- [ ] [Decide Dispatch mobile job lifecycle](06-dispatch-mobile-job-lifecycle.md)
- [ ] [Decide delivery tracking and notifications for merchants and customers](07-delivery-tracking-notifications.md)
- [ ] [Decide delivery pricing, fees, payment, and payout boundary](08-delivery-pricing-payment-payout.md)
- [ ] [Decide Dispatch app package, auth, and platform boundary](09-dispatch-app-package-auth-platform.md)
- [ ] [Decide delivery proof, incident, and accountability controls](10-proof-incident-accountability.md)
- [ ] [Decide future verified external dispatcher path](11-future-verified-external-dispatcher-path.md)
- [ ] [Prototype merchant-to-dispatch delivery flow](12-merchant-to-dispatch-prototype.md)

## Decisions so far

## Not yet specified

- Exact implementation spec and ticket breakdown after the decision tickets close.
- Exact database/schema evolution for internal dispatchers, rider identity, device/session state, delivery job assignment, proof of pickup/delivery, incidents, pricing, and payout after product boundaries are decided.
- Exact mobile app package boundary, navigation, authentication, and deployment setup for the separate Ewatrade Dispatch app after app/platform ownership is decided.
- Exact operational workflow for manually approving riders, monitoring dispatch jobs, and escalating failed deliveries after the internal dispatch model is decided.
- Future external dispatcher/company registration, verification, bidding, pricing marketplace, and public onboarding; preserve a path but do not build it in v1.

## Out of scope

- Implementing schema, APIs, mobile screens, admin console, notification adapters, payment/payout providers, or live dispatch operations inside this Wayfinder map.
- Opening self-serve registration for dispatch companies or independent riders in v1.
- Optimizing multi-rider routing, batching, route planning, live GPS maps, surge pricing, or delivery marketplace bidding unless a decision ticket explicitly keeps a small placeholder boundary.
- Replacing the existing Retail Ops delivery request bridge before its reusable boundaries are understood.
