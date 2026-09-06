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
- [x] Receive explicit owner approval or replacement-direction feedback.
- [x] Freeze the implementation contract.
- [x] Implement and verify production behavior.

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

## Owner decision

Option A, **Dispatch Ledger**, was explicitly approved on 6 September 2026.
The frozen decision is recorded in [approved.json](./approved.json), with the
production behavior and visual acceptance criteria in
[implementation-contract.md](./implementation-contract.md).

Status: approved, implemented, and verified in production.

## Production implementation evidence

- [First populated Light checkpoint](./implementation/checkpoint-03-populated-light.png)
- [Corrected populated Light](./implementation/populated-light.png)
- [Light after masthead scroll](./implementation/checkpoint-04-scrolled-light.png)
- [Populated Dark](./implementation/populated-dark-review.png)
- [Dark controls and fulfilment labels after scroll](./implementation/populated-dark-review-scrolled.png)
- [First-order Light](./implementation/first-order-light.png)
- [Offline and pending-sync Dark](./implementation/offline-dark.png)
- [Populated Light at 200% text](./implementation/populated-light-200-percent.png)
- [Scrollable order rows at 200% text](./implementation/populated-light-200-percent-scrolled.png)

The first populated checkpoint exposed clipped `.00` currency precision in the
three-column summary. The final presentation uses the same accurate minor-unit
value with compact whole-currency display, matching the approved ledger and
remaining readable in both themes. Native scroll evidence confirms marigold in
the status bar while the masthead is visible and canvas color after it clears.
The refreshed Dark pair explicitly verifies readable selected-filter labels and
the `PACK NEXT`, `IN FULFILMENT`, and `READY` action tags.
At 200% text, summary columns and order identity/amount pairs reflow rather than
clip; the full order list remains reachable and the dock hides on downward
scroll.

Focused presentation/QA-route tests, commerce, pagination, app-shell,
large-text, keyboard, theme, NativeWind, scoped Biome, and Android export checks
pass. The repository-wide admin-tabs archive check still reports pre-existing
unarchived evidence across older screen packages; it does not report an Orders
runtime or source failure. The full dirty-workspace TypeScript graph exhausted
8 GB, while the Android export compiled all 9,771 modules successfully.

<!-- implement-with-progress:start -->

## Implementation Progress

- Status: Complete
- Ticket Position: 10/38
- Completion: 100%
- Current Checklist: 9/9 — Implement and verify production behavior complete
- Blockers: None
- Brain Task: [Task](../../../../.brain/tasks/2026-09-06-orders-list-design-review.md)
- Last Updated: 2026-09-06T19:30:00+01:00

<!-- implement-with-progress:end -->
