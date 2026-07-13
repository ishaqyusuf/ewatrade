## Parent map

[Wayfinder: Ewatrade Dispatch Internal Delivery App](map.md)

## Type

grilling

## Status

resolved

## Blocked by

- [Decide Ewatrade Dispatch app identity and v1 product boundary](01-app-identity-v1-product-boundary.md)
- [Research current fulfillment bridge for Dispatch app reuse](02-current-fulfillment-bridge-research.md)
- [Decide internal dispatcher onboarding and approval model](03-internal-dispatcher-onboarding-approval.md)
- [Decide merchant delivery request entry points across business flows](04-merchant-delivery-entry-points.md)

## Question

How should delivery jobs move from an Ewatrade business request into the hands of an internal dispatcher/rider in v1?

Resolve manual assignment versus rider job pool versus automatic matching, what an operations/admin console must show, who can assign/reassign/cancel/escalate, how service areas and availability affect assignment, and which future marketplace/bidding concepts should remain dormant placeholders.

## Resolution

- V1 assignment is operations-controlled manual assignment with an optional internal "available jobs" pool. No automatic matching and no public bidding.
- Operations users can assign, reassign, cancel, reopen, and escalate delivery requests.
- Riders can acknowledge or reject an assignment with a reason, but cannot self-assign merchant-visible jobs unless operations explicitly exposes an internal pool.
- The operations console must show unassigned requests, assigned requests, rider availability, rider zone, stale acknowledgements, pickup/delivery SLA age, incidents, failed deliveries, and cancellation/escalation reasons.
- Service areas filter candidate riders but do not block a manual override; overrides require an operations note.
- Availability states: offline, available, busy, paused, suspended.
- Dormant future marketplace concepts: provider bids, external provider ranking, surge pricing, automated dispatch, and merchant-selected provider. Keep these out of v1 UX.
