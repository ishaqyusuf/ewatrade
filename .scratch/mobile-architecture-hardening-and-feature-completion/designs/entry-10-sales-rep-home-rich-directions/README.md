# EWA-BIZ-002, Sales Rep Home

Owner-review package for the next Market Day production screen.

The production route is `/sales-rep-home`. It currently renders the shared
`OperationsDashboardSurface` with attendant-only visibility. The redesign must
turn that role-filtered owner surface into a task-first rep workspace without
changing permissions, operational data, offline rules, or navigation targets.

## User job and behavior contract

- Make current shift or clock-in state immediately understandable.
- Keep Start sale as the dominant one-handed action.
- Preserve assigned stock, customer lookup, recent sales, sync, and closeout.
- Hide owner-only Catalog, Reports, setup, staff, and inventory-management work.
- Preserve sale gating when there is no open session or sellable item.
- Preserve online, offline, pending-sync, empty, loading, and closed-shift states.
- Keep the three-position attendant dock usable at 100% and 200% system text.

## Review checklist

- [x] Resolve the production route, component ownership, rep job, actions, and state matrix.
- [x] Archive the current verified Android attendant baseline before source changes.
- [x] Generate five genuinely different 390 × 844 Light/Dark Design HTML directions.
- [x] Render one comparison page with previous/next chevrons and theme switching.
- [x] Verify mobile, tablet, and desktop review layouts.
- [x] Rank the directions and recommend the strongest fit.
- [x] Receive explicit owner approval or replacement-direction feedback.
- [x] Freeze the implementation contract.
- [x] Implement and verify production behavior.

## Evidence index

### Current native screen

- [Android Light baseline](../../screenshots/entry-10-sales-rep-home/baseline/android-sales-rep-home-light.png)

The baseline is freshly captured from the existing attendant branch on isolated
`emulator-5556` in Light and Dark after the native-route connection regression
was corrected.

- [Android Dark baseline](../../screenshots/entry-10-sales-rep-home/baseline/android-sales-rep-home-dark.png)

### Design review board

- [Interactive comparison board](./comparison.html)
- [Comparison screenshot](./comparison.png)
- [Five Light directions](./all-options-light.png)
- [Five Dark directions](./all-options-dark.png)
- [Option A, Shift Ledger, Light](./option-a.png) / [Dark](./option-a-dark.png)
- [Option B, Counter Shift, Light](./option-b.png) / [Dark](./option-b-dark.png)
- [Option C, Pocket Till, Light](./option-c.png) / [Dark](./option-c-dark.png)
- [Option D, Day Route, Light](./option-d.png) / [Dark](./option-d-dark.png)
- [Option E, Trade Ticket, Light](./option-e.png) / [Dark](./option-e-dark.png)
- [Mobile review-page verification](./review-mobile.png)
- [Tablet review-page verification](./review-tablet.png)
- [Desktop review-page verification](./review-desktop.png)

The renderer verifies exactly one active direction, a 390 × 844 phone canvas,
status-bar coverage from the top screen edge, bottom-navigation safe bounds,
previous-chevron wraparound, next-chevron advancement, Light/Dark switching,
and the required 375, 768, and 1440 review widths.

## Direction ranking

1. **A, Shift Ledger**, recommended. The active shift proves readiness, Start
   sale is unmistakable, and stock, customers, sync, closeout, and recent work
   follow in the order an attendant needs them.
2. **C, Pocket Till**. The most approachable personal workspace, with a strong
   sale card and friendly daily total. The equal utility tiles soften priority.
3. **B, Counter Shift**. The strongest high-volume console and live-sales
   posture. Its dark-first energy is heavier during quiet or pre-shift states.
4. **D, Day Route**. The clearest sequence for a new rep. Experienced attendants
   may find the same guided route too instructional every day.
5. **E, Trade Ticket**. The boldest Market Day identity and most memorable
   composition. Literal receipt styling requires the most production restraint.

The owner approved Option A, `Shift Ledger`, on 2026-09-06. The frozen
[implementation contract](./implementation-contract.md) authorizes production
work while preserving truthful data, permissions, and existing operations.

### Implemented native screen

- [Final Light, 100%](../../screenshots/entry-10-sales-rep-home/final/light-100-populated.png)
- [Final Dark, 100%](../../screenshots/entry-10-sales-rep-home/final/dark-100-populated.png)
- [Final Light, 200% top](../../screenshots/entry-10-sales-rep-home/final/light-200-populated.png)
- [Final Dark, 200% top](../../screenshots/entry-10-sales-rep-home/final/dark-200-populated.png)
- [Final Light, 200% lower content](../../screenshots/entry-10-sales-rep-home/final/light-200-bottom.png)
- [Scrolled canvas status bar](../../screenshots/entry-10-sales-rep-home/states/light-scrolled-status-canvas.png)
- [Returned marigold status bar](../../screenshots/entry-10-sales-rep-home/states/light-returned-top-status-marigold.png)
- [Disabled](../../screenshots/entry-10-sales-rep-home/states/disabled-light.png)
- [Offline](../../screenshots/entry-10-sales-rep-home/states/offline-dark.png)
- [Pending sync](../../screenshots/entry-10-sales-rep-home/states/pending-sync-light.png)
- [Empty](../../screenshots/entry-10-sales-rep-home/states/empty-light.png)
- [Loading](../../screenshots/entry-10-sales-rep-home/states/loading-dark.png)
- [Error](../../screenshots/entry-10-sales-rep-home/states/error-light.png)

The implementation passed the deterministic native state matrix, 100%/200%
text, measured status-bar transition, disabled-control accessibility-tree
assertion, focused tests and source guards, scoped formatting, Android export,
and independent spec plus engineering-standards reviews. Review exposed and
resolved large-text clipping, dark accent contrast, unknown-readiness copy, and
loaded-versus-queued order-count semantics before completion.
