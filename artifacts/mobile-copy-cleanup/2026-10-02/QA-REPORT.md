# Mobile copy cleanup — 2 October 2026

## Scope

All 20 owner-approved review recommendations implemented. Changes cover Classic
Home, Orders, More and Catalog; shared checkout/customer choices, photo picker,
new business, workspace switching, billing, success, offline-order warning,
stock count and unit conversion. Existing unrelated working-tree edits preserved.

## Source checks

- 24 affected source/test/guard files pass Biome formatting and lint with import
  organization disabled (existing import order retained).
- 23 affected TypeScript files parse/transpile with zero errors. This is not a
  semantic or repository-wide TypeScript pass.
- Existing focused tests: 25 pass, 71 assertions. Home state/metrics, development
  fixture routing, workspace row behavior and subscription presentation.
- Existing operation-success, dashboard-redesign and business-onboarding UI guards
  pass. Existing copy assertions/success markers updated to the approved wording.
- 28 retired phrases checked across affected files: zero leftovers.
- Scoped diff whitespace check passes.

## Android checks

Reused emulator-5554 and the existing development app/Metro. No physical-device
operations, merchant writes, installation or server restart.

- Eight Home checks pass: new business, catalog ready, everyday, and unfinished
  catalog in Light and Dark. See `native-results.json` and matching PNG/XML pairs.
- Visually inspected Light new-business and Dark everyday captures: current task,
  progress, action, metrics and dock remain readable without the removed prose.
- Fixture Add action advances to unfinished-catalog and retains readiness guidance;
  captured in `add-action.png` / `.xml`. This is a local simulated transition.
- Light theme restored by the final fixture opening. Font/animation settings were
  not changed. Initial native Catalog tree also showed the shorter header.

An initial UI dump exited 137; a bounded retry completed the eight-state matrix.
A subsequent attempt to extend callback/tab checks could not find the expected
“Finish item setup” control in the then-current screen; no extended callback/tab
acceptance is claimed. Full checkout, all changed screens, TalkBack, iOS and
native release builds were not exercised.

## Existing validation failures

The create-sale guard still checks retired monolithic `create-sale-sheet.tsx`
implementation markers. The subscription guard expects native-store integration
markers absent before this task. Both reproduce identically against captured
pre-edit source; neither is reported as a pass or repaired in this copy change.

Brain impact: updated the Home behavior description and added the copy-cleanup
feature contract and completion entry. No API/database/architecture decision or
finance-roadmap change.
