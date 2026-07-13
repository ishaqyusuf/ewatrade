## Parent map

[Wayfinder: Ewatrade Dispatch Internal Delivery App](map.md)

## Type

prototype

## Status

resolved

## Blocked by

- [Decide Ewatrade Dispatch app identity and v1 product boundary](01-app-identity-v1-product-boundary.md)
- [Research current fulfillment bridge for Dispatch app reuse](02-current-fulfillment-bridge-research.md)
- [Decide internal dispatcher onboarding and approval model](03-internal-dispatcher-onboarding-approval.md)
- [Decide merchant delivery request entry points across business flows](04-merchant-delivery-entry-points.md)
- [Decide dispatch job assignment and operations model](05-dispatch-job-assignment-operations.md)
- [Decide Dispatch mobile job lifecycle](06-dispatch-mobile-job-lifecycle.md)
- [Decide delivery tracking and notifications for merchants and customers](07-delivery-tracking-notifications.md)
- [Decide delivery pricing, fees, payment, and payout boundary](08-delivery-pricing-payment-payout.md)
- [Decide Dispatch app package, auth, and platform boundary](09-dispatch-app-package-auth-platform.md)
- [Decide delivery proof, incident, and accountability controls](10-proof-incident-accountability.md)
- [Decide future verified external dispatcher path](11-future-verified-external-dispatcher-path.md)

## Question

Create a rough prototype artifact that lets the team react to the v1 Ewatrade Dispatch experience before implementation planning.

The artifact should cover merchant delivery selection from Product Sales and Dry Cleaning/Laundry, internal dispatch assignment, rider app job list/detail, pickup and delivery status updates, proof/incident states, customer tracking/notifications, and a visible future-gated external dispatcher path at just enough fidelity to expose product gaps.

## Prototype Artifact

### Merchant Flow

1. Product Sales or Dry Cleaning staff opens an order/service order.
2. Staff taps `Request delivery`.
3. A delivery sheet asks for pickup contact/address, dropoff contact/address, requested time, notes, fee responsibility, and package summary.
4. Staff submits. Source order shows `Delivery requested` with tracking token and current status.

### Operations Flow

1. Operations dashboard opens `Delivery requests`.
2. Unassigned requests show source type, merchant, pickup/dropoff zones, age, fee responsibility, and customer contact completeness.
3. Operations assigns an approved available rider, with service-area warnings and override notes when needed.
4. Operations can reassign, cancel, or escalate.

### Rider App Flow

1. Rider logs into Ewatrade Dispatch and sets availability.
2. Assigned jobs list shows pickup area, dropoff area, package summary, and age.
3. Job detail shows pickup/dropoff instructions, customer-safe contact actions, and required proof.
4. Rider acknowledges, marks pickup arrival, submits pickup proof, marks picked up, marks dropoff arrival, then submits delivery proof.
5. Failed delivery path requires reason, note, and next action.

### Customer Tracking Flow

1. Customer receives an opaque tracking link.
2. Tracking page shows request accepted, rider assigned, picked up, delivered, delayed, failed, or cancelled.
3. Page hides internal notes, payout data, raw ids, and proof media unless a future policy explicitly exposes proof.

### Future-Gated External Dispatch Path

An operations-only placeholder shows `External providers: gated` with required future gates: provider verification, zones, bidding/matching policy, payout setup, incident liability, and dispute handling.
