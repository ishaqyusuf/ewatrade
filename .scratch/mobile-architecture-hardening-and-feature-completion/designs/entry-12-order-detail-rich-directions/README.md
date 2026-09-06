# EWA-BIZ-004, Order detail

Owner-review package for the next Market Day production screen.

The production route is `/order/[orderId]`, rendered by
`CommercialOrderScreen` and `CommercialOrderOverviewContent`. It preserves
live/cached Order resolution, customer navigation, product fulfilment,
fulfil-all, scheduled-delivery gating, payment recording, totals, notes,
activity, refresh, offline, error, loading, and not-found behavior.

## Current native baseline

- [Current Light](../../screenshots/entry-12-order-detail/baseline/current-light.png)
- [Current Dark](../../screenshots/entry-12-order-detail/baseline/current-dark.png)

The baseline is rendered from the actual production Order-detail components by
an exact development-only inert fixture route. It makes no API, payment, or
fulfilment mutation.

## Five directions

1. **A, Dispatch Docket**, recommended. The strongest continuation from the
   approved Orders Dispatch Ledger: total, balance, customer, lines, and next
   movement are distinct without becoming another list screen.
2. **C, Fulfilment Route**. Best staff guidance and clearest next-action flow,
   but it demotes the complete financial breakdown.
3. **B, Counter Receipt**. Most memorable transaction identity and strongest
   payment calculation, with less room for long operational history.
4. **D, Split Ledger**. Highest information density for experienced owners,
   but visually heavier than the wider owner journey.
5. **E, Customer Parcel**. Warmest customer/delivery story, but the parcel
   metaphor fits service-only orders less naturally.

## Evidence

- [Interactive comparison](./comparison.html)
- [Comparison board screenshot](./comparison.png)
- [All Light options](./all-options-light.png)
- [All Dark options](./all-options-dark.png)
- [Option A Light](./option-a.png) / [Dark](./option-a-dark.png)
- [Option B Light](./option-b.png) / [Dark](./option-b-dark.png)
- [Option C Light](./option-c.png) / [Dark](./option-c-dark.png)
- [Option D Light](./option-d.png) / [Dark](./option-d-dark.png)
- [Option E Light](./option-e.png) / [Dark](./option-e-dark.png)
- [Mobile review verification](./review-mobile.png)
- [Tablet review verification](./review-tablet.png)
- [Desktop review verification](./review-desktop.png)

Status: awaiting explicit owner approval. No production Order-detail visual
implementation is authorized yet.
