# EWA-ENTRY-008, App Lock

Owner-review batch for the next Market Day screen package.

- `comparison.html` carries five distinct 390 × 844 directions with the approved top-right previous/next chevrons and Light/Dark preview.
- The native baseline was captured from the real `/app-lock-modal` component through a temporary development-only local-session entry. That entry was removed immediately after capture; production App Lock source was not changed.
- The owner selected Option E, **Quiet Seal**, on 2026-09-04. It keeps one memorable paprika-and-palm seal above a calm, centered keypad and avoids turning App Lock into a banking screen. Production implementation is now authorized.

All directions preserve the actual App Lock contract: device-local six-digit PIN creation and confirmation, current-PIN verification for change/disable, automatic unlock submission, wrong-code and temporary lockout feedback, optional fingerprint unlock, close behavior, and forgotten-code sign-out/reset recovery.

## Evidence Index

### Current native screen

- [Android Light create-PIN baseline](../../screenshots/entry-08-app-lock/baseline/android-create-pin-light.png)
- [Android Dark create-PIN baseline](../../screenshots/entry-08-app-lock/baseline/android-create-pin-dark.png)

### Design review board

- [Interactive five-option comparison](comparison.html)
- [Full comparison-board screenshot](comparison.png)
- [All five Light directions](all-options-light.png)
- [All five Dark directions](all-options-dark.png)
- [Option A alignment review, original versus refined in Light and Dark](option-a-alignment-review.png)
- Option A original before alignment refinement: [Light](option-a-v1-before-alignment.png) · [Dark](option-a-v1-before-alignment-dark.png)
- Option A, Market Vault: [Light](option-a.png) · [Dark](option-a-dark.png)
- Option B, Ledger Lock: [Light](option-b.png) · [Dark](option-b-dark.png)
- Option C, Night Safe: [Light](option-c.png) · [Dark](option-c-dark.png)
- Option D, Counter Shutter: [Light](option-d.png) · [Dark](option-d-dark.png)
- Option E, Quiet Seal: [Light](option-e.png) · [Dark](option-e-dark.png)

### Implemented native review

- Refined Option E at 100% text: [Light](../../screenshots/entry-08-app-lock/progress/android-option-e-refined-light.png) · [Dark](../../screenshots/entry-08-app-lock/progress/android-option-e-refined-dark.png)
- Option E at 200% text, including the scroll-reachable final keypad row and device note: [Light top](../../screenshots/entry-08-app-lock/progress/android-option-e-light-200-text.png) · [Light scrolled](../../screenshots/entry-08-app-lock/progress/android-option-e-light-200-text-scrolled.png) · [Dark top](../../screenshots/entry-08-app-lock/progress/android-option-e-dark-200-text.png) · [Dark scrolled](../../screenshots/entry-08-app-lock/progress/android-option-e-dark-200-text-scrolled.png)

### Reproduction and decision

- `render.mjs` regenerates all ten option screenshots, captures the full board, and verifies previous/next wrapping plus theme switching.
- `recommendation.json` records the earlier recommendation and the final owner selection.
- `approved.json` and `implementation-contract.md` freeze Option E as the production handoff.

Screenshot PNGs under `.scratch/` remain local project evidence under the repository's current ignore policy. The HTML and renderer keep the design batch reproducible.

## Design directions

1. **A, Market Vault**: branded palm hero plus a high-contrast physical lockbox and tactile keypad. The refinement uses one content axis, an equal six-column PIN rail, three equal keypad columns, and a balanced full-width device note.
2. **B, Ledger Lock**: merchant-ledger paper, numbered PIN positions, square stamped keys.
3. **C, Night Safe**: dark-first biometric safe with restrained green illumination.
4. **D, Counter Shutter**: market-closing shutter and receipt-ticket keypad.
5. **E, Quiet Seal**: editorial device seal with a calm linear keypad.

## Implementation Checklist

- [x] Resolve the existing route, data contract, controls and state matrix.
- [x] Capture the actual Android Light/Dark baseline before App Lock production-source changes.
- [x] Generate and render five Light/Dark review directions with chevron navigation.
- [x] Receive explicit owner design approval.
- [x] Record the selected implementation contract without changing App Lock behavior.
- [x] Implement the selected direction with shared semantic mobile primitives.
- [x] Verify setup, confirm, manage, unlock, biometric, error, lockout and reset states.
- [x] Verify Light/Dark, 100%/200% text, touch targets, status bar and device-safe layout.
- [x] Run focused source checks, Android export, visual review, code review and close documentation.

## Validation Evidence

- Nine focused App Lock tests / 14 expectations pass across layout,
  presentation, hydration and route-boundary behavior; the App Lock
  source-contract, NativeWind-style, large-text and design-system checks also
  pass.
- Android Expo export succeeds across the current 9,755-module bundle.
- Native Android evidence covers Light and Dark at 100% text plus top and
  scrolled views at 200% text. The status bar follows the paprika cap and the
  final keypad row and device-only note remain reachable by a short scroll.
- The full mobile TypeScript check reaches the codebase and reports existing
  errors in QA, customer-conversation, catalog, sales, staff and shared database
  work. It reports no App Lock files; the focused App Lock checks, formatting
  gate and Android export remain green.

## Final review

The independent standards and specification passes found four material gaps
in the first implementation: choice labels and the device note capped system
text too aggressively, 200% keypad targets stayed at their compact height, the
scroll container relied on implicit bottom-safe-area behavior, and asynchronous
PIN/fingerprint verification did not expose a truthful pending state. The
final implementation removes those gaps: essential copy scales to 200%, large
text uses 68-point keypad rows, the scroll body includes the live bottom inset,
and every disabled async control publishes its accessibility state while the
screen names the active check.

The review also removed an obsolete customer-history route assertion. Two
intentional implementation boundaries remain documented rather than treated as
defects: the approved security gate uses its shared Quiet Seal screen shell
instead of the generic workflow-modal composition, and its exact angled cap,
seal and keypad geometry stays in one isolated `StyleSheet`. The development-
only preview entry remains because it is the reproducible native screenshot and
state-review seam; production builds keep that tooling unavailable.

<!-- implement-with-progress:start -->

## Implementation Progress

- Status: Done
- Ticket Position: 8/38
- Completion: 100%
- Current Checklist: 9/9 — Complete; advance to Business Home baseline
- Blockers: None
- Brain Task: [Task](../../../../.brain/tasks/2026-09-04-app-lock-market-day-directions.md)
- Last Updated: 2026-09-06T08:39:48+01:00

<!-- implement-with-progress:end -->
