## Parent map

[Wayfinder: Ewatrade Dispatch Internal Delivery App](map.md)

## Type

grilling

## Status

resolved

## Blocked by

- [Decide Dispatch mobile job lifecycle](06-dispatch-mobile-job-lifecycle.md)
- [Decide delivery tracking and notifications for merchants and customers](07-delivery-tracking-notifications.md)
- [Decide delivery pricing, fees, payment, and payout boundary](08-delivery-pricing-payment-payout.md)

## Question

What proof, incident, and accountability controls are required for v1 internal dispatch so merchants, customers, riders, and Ewatrade operations can trust delivery status updates?

Resolve proof of pickup/delivery, photos/signature/OTP options, failed-delivery reasons, damaged/missing package reports, cancellation reasons, rider/customer notes, support escalation, audit history, and which controls can wait until external dispatchers are allowed.

## Resolution

- V1 proof events are durable tracking/audit records linked to delivery request, assignment, actor, timestamp, device id when available, location when available, and source order.
- Pickup proof: package photo or package-count note, pickup contact name, optional pickup signature.
- Delivery proof: recipient name plus photo or signature. OTP can be added for higher-risk flows but should not block the first internal pilot.
- Incident types: customer unavailable, wrong address, package damaged, package missing, merchant not ready, rider safety issue, payment issue, cancellation requested, other.
- Failed delivery requires a reason, note, and next action: retry, return to merchant, cancel, or escalate.
- Operations can add internal notes, resolve incidents, mark support outcome, and attach evidence references.
- Customer-visible notes are separate from internal notes.
- Later external-provider controls: stronger KYC, insurance docs, provider liability rules, payout holds, ratings, formal dispute windows, and automated fraud/risk scoring.
