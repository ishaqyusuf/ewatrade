# EWA-BIZ-003, Orders list

Owner-review package for the next Market Day production screen.

The production route is `/(admin-tabs)/orders`, rendered by
`AdminOrdersScreen`. It loads paginated Commercial Orders, combines truthful
device-provisional work, supports date and status filters, conditionally exposes
search, and preserves offline, pending-sync, error, loading, first-order, empty,
and populated states.

## User job and behavior contract

- See which orders need fulfilment movement now.
- Scan customer, amount, item count, payment/fulfilment context, and status.
- Keep date, status, search, pagination, refresh, and customer-book access.
- Preserve the first-order catalog readiness gate and create-sale routing.
- Keep provisional orders distinct from server-loaded totals.
- Preserve offline limitations and queued-work reconciliation language.
- Keep the five-position business dock and Create action usable at 100% and
  200% system text.

## Review checklist

- [x] Resolve the production route, data, actions, state matrix, and navigation.
- [x] Archive the current verified Android Light/Dark baseline.
- [x] Generate five genuinely different 390 × 844 Light/Dark directions.
- [x] Render one comparison page with previous/next chevrons and theme switching.
- [x] Verify mobile, tablet, and desktop review layouts.
- [x] Rank the directions and recommend the strongest fit.
- [ ] Receive explicit owner approval or replacement-direction feedback.
- [ ] Freeze the implementation contract.
- [ ] Implement and verify production behavior.

## Evidence index

### Current native screen

- [Android Light baseline](../../screenshots/entry-11-orders-list/baseline/current-light.png)
- [Android Dark baseline](../../screenshots/entry-11-orders-list/baseline/current-dark.png)

These images archive the current first-order Orders surface that remains
implemented by `AdminOrdersScreen`; this batch redesigns its populated working
list while retaining that empty-state behavior.

### Design review board

- [Interactive comparison board](./comparison.html)
- [Comparison screenshot](./comparison.png)
- [Five Light directions](./all-options-light.png)
- [Five Dark directions](./all-options-dark.png)
- [Option A, Dispatch Ledger, Light](./option-a.png) / [Dark](./option-a-dark.png)
- [Option B, Fulfilment Board, Light](./option-b.png) / [Dark](./option-b-dark.png)
- [Option C, Receipt Stack, Light](./option-c.png) / [Dark](./option-c-dark.png)
- [Option D, Delivery Route, Light](./option-d.png) / [Dark](./option-d-dark.png)
- [Option E, Cashbook Columns, Light](./option-e.png) / [Dark](./option-e-dark.png)
- [Mobile review-page verification](./review-mobile.png)
- [Tablet review-page verification](./review-tablet.png)
- [Desktop review-page verification](./review-desktop.png)

The renderer verifies exactly one active direction, a 390 × 844 phone canvas,
status-bar color from the top screen edge, bottom-navigation safe bounds,
previous-chevron wraparound, next-chevron advancement, Light/Dark switching,
and the required 375, 768, and 1440 review widths. A first render exposed an
Option B header-color inheritance defect; it was fixed before this review gate.

## Direction ranking

1. **A, Dispatch Ledger**, recommended. Today’s load and next fulfilment work
   lead, while amount, customer, and status remain easy to compare row by row.
2. **D, Delivery Route**. The clearest next-action sequence for fulfilment staff,
   but suggested ordering may feel too prescriptive for experienced owners.
3. **B, Fulfilment Board**. The strongest high-volume operations view, with more
   visual pressure than the rest of the owner journey.
4. **E, Cashbook Columns**. Excellent scan density for experienced operators,
   with less visual guidance for newer merchants.
5. **C, Receipt Stack**. The boldest transaction identity, but long customer and
   item names need the most production restraint.

Status: awaiting explicit owner selection. No Orders production code has been
changed by this design batch.

<!-- implement-with-progress:start -->

## Implementation Progress

- Status: In Progress
- Ticket Position: 10/38
- Completion: 67%
- Current Checklist: 7/9 — Receive explicit owner approval or replacement-direction feedback
- Blockers: None — planned owner decision gate
- Brain Task: [Task](../../../../.brain/tasks/2026-09-06-orders-list-design-review.md)
- Last Updated: 2026-09-06T13:12:00+01:00

<!-- implement-with-progress:end -->
