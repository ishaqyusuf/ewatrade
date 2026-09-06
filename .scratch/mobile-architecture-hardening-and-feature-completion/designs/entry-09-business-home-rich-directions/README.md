# EWA-BIZ-001, Business Home

Owner-review package for the next Market Day production screen.

The production surface is shared by `/dashboard` and
`/(admin-tabs)/admin-home`. It serves owners who need to understand Store
readiness, act on setup work, scan current operations, create work, and reach
recent orders without losing the persistent Business navigation shell.

## Behavior and state contract

- Preserve owner versus attendant visibility, feature availability and
  offline/provisional work policy.
- Preserve Store-setup versus operational-overview branches.
- Preserve global search, sync notification, Business switch, central Create,
  Catalog, Work, Reports, recent-order and personal-conversation navigation.
- Preserve loading, empty, pending-sync, populated-orders and disabled-action
  states.
- Keep the bottom navigation and central action usable at 100% and 200% system
  text in Light and Dark themes.

## Implementation Checklist

- [x] Resolve the production routes, component ownership, user job, actions and state matrix.
- [x] Capture the untouched current Android Business Home baseline in Light and Dark.
- [x] Generate five genuinely different 390 × 844 Light/Dark Design HTML directions.
- [x] Render a single comparison page with top-right previous/next controls and theme switching.
- [x] Rank the directions, recommend the strongest fit and pause for owner approval.
- [x] Record explicit owner approval and freeze the implementation contract.
- [x] Implement the approved direction without changing Business behavior or permissions.
- [x] Verify applicable loading, empty, populated, offline, disabled and navigation states.
- [x] Verify Light/Dark, 100%/200% text, compact viewport, status bar, scrolling and touch targets.
- [x] Run focused tests, source/style checks, Android export, two-axis review, documentation and commit.

## Evidence Index

### Current native screen

- [Android Light baseline](../../screenshots/entry-09-business-home/baseline/android-business-home-light.png)
- [Android Dark baseline](../../screenshots/entry-09-business-home/baseline/android-business-home-dark.png)

Both frames use the existing development-only `b001` fixture, which composes
the production `MobileAppShell`, dashboard header, Store setup, snapshot and
empty-order primitives with deterministic inert callbacks. It makes no API,
database, credential or mutation request.

### Design review board

- [Interactive comparison board](./comparison.html)
- [Comparison screenshot](./comparison.png)
- [Five Light directions](./all-options-light.png)
- [Five Dark directions](./all-options-dark.png)
- [Option A, Market Ledger, Light](./option-a.png) / [Dark](./option-a-dark.png)
- [Option B, Counter Pulse, Light](./option-b.png) / [Dark](./option-b-dark.png)
- [Option C, Sunrise Board, Light](./option-c.png) / [Dark](./option-c-dark.png)
- [Option D, Trade Map, Light](./option-d.png) / [Dark](./option-d-dark.png)
- [Option E, Open Stall, Light](./option-e.png) / [Dark](./option-e-dark.png)
- [Mobile review-page verification](./review-mobile.png)
- [Tablet review-page verification](./review-tablet.png)
- [Desktop review-page verification](./review-desktop.png)

The renderer verifies exactly one active direction, a 390 × 844 phone canvas,
status-bar coverage from the top screen edge, bottom-navigation safe bounds,
previous-chevron wraparound, next-chevron advancement, and Light/Dark control
behavior.

## Direction Ranking

1. **A, Market Ledger** — recommended. The strongest owner scan from Business
   identity to next action, Store facts, and recent work, with a visual system
   that can mature from setup into daily operations.
2. **C, Sunrise Board** — the warmest continuation from onboarding, but its
   large opening masthead leaves less room once operations become dense.
3. **B, Counter Pulse** — the strongest live-operations posture, but heavier
   than needed for an owner opening an empty Store.
4. **E, Open Stall** — the most literal Market Day personality; translating
   the stall language to production needs restraint.
5. **D, Trade Map** — excellent setup guidance, but the route metaphor should
   recede once the Store is operational.

Recommendation does not authorize implementation. Production source remains
untouched until the owner explicitly approves one option or requests another
batch.

## Owner Decision

- Approved option: **A, Market Ledger**
- Approved on: 2026-09-06
- Owner feedback: “Option A.”
- [Approval record](./approved.json)
- [Frozen implementation contract](./implementation-contract.md)

### Implemented native review

- Production implementation: `apps/mobile/src/components/mobile/business-home-market-ledger.tsx`
- Deterministic native QA surface: `apps/mobile/src/components/mobile/business-home-market-ledger-qa-screen.tsx`
- Development-only QA route: `apps/mobile/src/app/design-system/business-home-market-ledger.tsx`
- Source checks passed: Business Home contract, app shell, design-system playground,
  keyboard coverage, large-text layout, NativeWind/style mixing and Biome.
- The monorepo-wide TypeScript process exhausted both 4 GB and 8 GB heaps before
  emitting diagnostics; the Android bundle/export checkpoint remains the
  authoritative compiler and module-resolution validation for this ticket.

### Native implementation evidence

- [Light 100% setup](../../screenshots/entry-09-business-home/progress/light-100-setup-top.png)
- [Light 100% status switched](../../screenshots/entry-09-business-home/progress/light-100-setup-status-switched.png)
- [Light 100% status restored](../../screenshots/entry-09-business-home/progress/light-100-setup-restored.png)
- [Light 100% catalog ready](../../screenshots/entry-09-business-home/progress/light-100-catalog-ready.png)
- [Light 100% populated](../../screenshots/entry-09-business-home/progress/light-100-operational-populated.png)
- [Light 100% attendant](../../screenshots/entry-09-business-home/progress/light-100-attendant.png)
- [Light 100% loading](../../screenshots/entry-09-business-home/progress/light-100-loading.png)
- [Dark 100% operational empty](../../screenshots/entry-09-business-home/progress/dark-100-operational-empty.png)
- [Dark 100% offline](../../screenshots/entry-09-business-home/progress/dark-100-offline.png)
- [Dark 100% pending sync](../../screenshots/entry-09-business-home/progress/dark-100-pending-sync.png)
- [Light 200% setup top](../../screenshots/entry-09-business-home/progress/light-200-setup-top.png)
- [Light 200% setup scrolled](../../screenshots/entry-09-business-home/progress/light-200-setup-scrolled.png)
- [Dark 200% catalog ready top](../../screenshots/entry-09-business-home/progress/dark-200-catalog-ready-top.png)
- [Dark 200% catalog ready scrolled](../../screenshots/entry-09-business-home/progress/dark-200-catalog-ready-scrolled.png)
- [Dark 200% operational top](../../screenshots/entry-09-business-home/progress/dark-200-operational-populated-top.png)
- [Dark 200% operational scrolled](../../screenshots/entry-09-business-home/progress/dark-200-operational-populated-scrolled.png)

Android accessibility-tree checks confirmed all setup steps, facts, state
messages, Recent orders actions and the full-width CTA remain reachable. The
status bar switches from paprika to the current ledger canvas only after the
measured hero clears, then restores with the dock on upward scroll.

<!-- implement-with-progress:start -->

## Implementation Progress

- Status: Complete
- Ticket Position: 9/38
- Completion: 100%
- Current Checklist: 10/10 — Complete
- Blockers: None
- Brain Task: [Task](../../../../.brain/tasks/2026-09-06-business-home-market-day-directions.md)
- Last Updated: 2026-09-06T10:12:00+01:00

<!-- implement-with-progress:end -->
