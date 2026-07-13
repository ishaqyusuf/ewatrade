## Parent map

[Wayfinder: Ewatrade Dispatch Internal Delivery App](map.md)

## Type

grilling

## Status

resolved

## Blocked by

- [Decide Ewatrade Dispatch app identity and v1 product boundary](01-app-identity-v1-product-boundary.md)
- [Decide merchant delivery request entry points across business flows](04-merchant-delivery-entry-points.md)
- [Decide dispatch job assignment and operations model](05-dispatch-job-assignment-operations.md)

## Question

What is the v1 boundary for delivery fees, who pays, when payment is collected, how fees appear to merchants/customers, and whether rider payouts or internal settlement are tracked in the app?

Resolve whether v1 supports fixed fees, manual quote, distance-based placeholder, cash-on-delivery handling, merchant-paid versus customer-paid delivery, refund/cancellation fee behavior, and what must remain out of scope until provider/payment work matures.

## Resolution

- V1 supports manual delivery fee entry and optional zone-based fixed fee presets. Distance-based pricing remains a placeholder until routing/distance services are selected.
- Fee responsibility is explicit per request: merchant-paid, customer-paid, or included in order/service price.
- Payment collection stays with the source workflow in v1. Dispatch does not collect online payments or manage rider cash settlement beyond notes.
- Cash-on-delivery can be recorded as source-order payment metadata, not as rider payout automation.
- Rider payout tracking is internal/manual in v1: operations can record payout amount/status notes, but no wallet, automated settlement, or provider disbursement is built.
- Cancellations after assignment may record a cancellation fee decision and responsible party, but actual refunds/charges stay outside v1 unless the source order payment bridge supports them.
- Later: distance pricing, surge, automatic quotes, provider fees, rider wallets, marketplace commission, and payout reconciliation.
