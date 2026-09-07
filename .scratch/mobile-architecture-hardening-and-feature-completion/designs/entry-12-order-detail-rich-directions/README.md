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

## Owner decision

Option A, **Dispatch Docket**, was explicitly approved on 6 September 2026.
The frozen decision is recorded in [approved.json](./approved.json), with its
production behavior and visual acceptance criteria in
[implementation-contract.md](./implementation-contract.md).

## Native implementation evidence

- [Light, 100%, corrected actions](../../screenshots/entry-12-order-detail/implementation/button-final-light.png)
- [Dark, 100%, corrected actions](../../screenshots/entry-12-order-detail/implementation/button-final-dark.png)
- [Scrolled Light status bar](../../screenshots/entry-12-order-detail/implementation/scrolled-light.png)
- [Scrolled Dark status bar](../../screenshots/entry-12-order-detail/implementation/scrolled-dark.png)
- [Paid](../../screenshots/entry-12-order-detail/implementation/paid-light.png)
- [Offline](../../screenshots/entry-12-order-detail/implementation/offline-light.png)
- [Scheduled delivery](../../screenshots/entry-12-order-detail/implementation/scheduled-light.png)
- [Light, 200%, corrected action](../../screenshots/entry-12-order-detail/implementation/button-final-light-200-percent.png)
- [Scrolled Light, 200%, corrected line action](../../screenshots/entry-12-order-detail/implementation/button-final-light-200-percent-scrolled.png)

The prior [Light correction baseline](../../screenshots/entry-12-order-detail/implementation/second-pass-light.png)
is retained as before evidence. It shows the low-contrast Light fulfil action and
the oversized, dark Record payment content that triggered this correction pass.

## Companion action surfaces

The Order detail batch now includes the directly opened tasks, not only the
parent page. Review the six **Record payment**, **Fulfil line**, **Fulfil all
ready**, and **Customer record** directions in the
[Order actions companion package](../entry-12-order-actions-rich-directions/README.md).
Production work on these child surfaces is paused for explicit owner choice.
The selected-customer state is included here because Order detail opens it
directly; the complete Customer directory remains its own later screen batch.

## Implementation checklist

- [x] Freeze the owner-approved direction and behavior contract.
- [x] Add focused presentation-model coverage.
- [x] Implement the Dispatch Docket production composition.
- [x] Preserve query, navigation, payment, fulfilment, and state behavior.
- [x] Implement masthead-following status-bar behavior.
- [x] Expand the inert native QA surface across required states.
- [x] Capture Light/Dark, scroll, state, and 100%/200% native evidence.
- [x] Verify and commit the Record payment and Fulfil line button corrections.
- [x] Archive current payment, immediate fulfilment, and Customer record behavior.
- [x] Prepare six four-state Light/Dark companion directions, including the requested minimalist Option F, and pause for owner approval.
- [ ] Implement the owner-approved Order companion surfaces.
- [ ] Run final source, formatting, bundle, and independent review gates.
- [ ] Commit the scoped implementation and synchronize Brain/program records.

Status: parent implemented; companion action batch awaiting owner approval.

<!-- implement-with-progress:start -->

## Implementation Progress

- Status: In Progress
- Ticket Position: 11/38
- Completion: 77%
- Current Checklist: 11/13 — Implement the owner-approved Order companion surfaces
- Blockers: Awaiting explicit owner approval of the four-state companion direction
- Brain Task: [Task](../../../../.brain/tasks/2026-09-06-order-detail-design-review.md)
- Last Updated: 2026-09-07T00:18:00+01:00

<!-- implement-with-progress:end -->
