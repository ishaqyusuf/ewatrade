# Spec: EwaTrade Mobile Design System Playground

Status: ready-for-agent
Source map: [Wayfinder: Mobile Design System Playground](map.md)

## Problem Statement

EwaTrade mobile already has many useful primitives and flow-specific components, but there is no single approval surface where the project owner can inspect the whole mobile design system before future screens are refactored. Without that surface, design work can drift screen by screen: tokens may be used inconsistently, light and dark mode may diverge, modals and bottom sheets may behave differently across workflows, and analytics/reporting patterns may become a separate visual language from daily Retail Ops work.

The project owner wants to pause before continuing broad feature work and establish a clean, polished, mobile-only design system. The first approved deliverable should be an Expo playground screen that catalogs the primitives, headers, buttons, lists, modals, sheets, bottom footers, analytics cards, bar charts, and pattern screens that future mobile work must follow. Existing mobile screens should only be brought into compliance after this playground has been reviewed and approved.

## Solution

Build a mobile-only design-system playground for the Expo app. The playground is an internal approval surface, not a customer-facing product workflow. It should expose a catalog home and pattern/detail screens that let the reviewer inspect tokens, typography, headers, actions, forms, lists, status states, modals, sheets, navigation/footer patterns, analytics, and Retail Ops domain patterns in both light and dark mode.

The playground should curate and harden the current mobile design foundation rather than inventing a parallel system. It should use the existing semantic token direction, shared mobile primitives, haptic controls, keyboard-safe sheets, and flow-specific primitives for dashboard, reports, sale, session, setup, share links, and sync. Where current primitives are inconsistent, the playground should identify whether to keep, fold, rename, deprecate, or ignore them.

The approval loop should include screenshots or a walkthrough that cover light mode, dark mode, compact phones, interactive modals and bottom sheets, keyboard-open states, analytics and chart examples, and model-review notes from Gemini and Gravity where available. Gemini and Gravity are advisory reviewers only; final approval stays with the project owner.

## User Stories

1. As the project owner, I want one mobile design-system playground, so that I can approve the UI foundation before more screens are built.
2. As the project owner, I want the playground to be mobile-only for now, so that the first approval loop stays focused.
3. As the project owner, I want to inspect light and dark mode in the same playground, so that theme quality is visible before implementation expands.
4. As the project owner, I want to see multiple header styles, so that we choose a consistent header language for auth, dashboards, sheets, and detail screens.
5. As the project owner, I want to see all button and icon-button styles, so that primary, secondary, destructive, loading, disabled, and pressed states are clear.
6. As the project owner, I want the playground to open modal examples, so that confirmation and destructive flows can be reviewed interactively.
7. As the project owner, I want the playground to open bottom-sheet examples, so that focused forms and keyboard behavior can be approved.
8. As the project owner, I want to see bottom footer and sticky action patterns, so that important mobile actions have a consistent place.
9. As the project owner, I want buttons that navigate to list, header, detail, and pattern screens, so that the design system can be reviewed beyond one long catalog page.
10. As the project owner, I want analytics cards and bar charts included, so that reporting visuals are part of the system from the beginning.
11. As the project owner, I want Gemini and Gravity feedback captured, so that local model critique can help catch design issues before approval.
12. As a mobile user, I want the future app to feel visually consistent, so that every workflow feels like the same product.
13. As a mobile user, I want light mode to be bright and readable, so that the app works well in shops during the day.
14. As a mobile user, I want dark mode to feel intentional and matte, so that it is not a simple color inversion.
15. As a mobile user, I want text and controls to fit compact phones, so that the app remains usable on smaller devices.
16. As a mobile user, I want status states to be semantic and clear, so that offline, pending, success, warning, and destructive states are not color-only.
17. As a mobile user, I want input screens and sheets to stay keyboard-safe, so that fields and actions do not hide behind the keyboard.
18. As an owner, I want dashboard metrics and quick actions to use approved patterns, so that business health is easy to scan.
19. As an owner, I want report rows and charts to use approved patterns, so that analytics stay readable on mobile.
20. As an owner, I want product and inventory rows to use approved patterns, so that stock and sellable units are easy to distinguish.
21. As an attendant, I want sale rows, payment choices, quantity controls, and totals to use approved patterns, so that checkout is fast and confident.
22. As a manager, I want sync and conflict patterns to use approved states, so that operational reliability issues are understandable.
23. As a developer, I want the playground to use existing exported primitives where possible, so that we do not build a second component library.
24. As a developer, I want the playground to make canonical primitives explicit, so that future implementation agents know which components to reuse.
25. As a developer, I want duplicated or inconsistent local widgets identified, so that later cleanup has a clear target.
26. As a developer, I want semantic token examples, so that hard-coded color usage does not spread.
27. As a developer, I want typography and density examples, so that headings, section labels, totals, helper text, and list rows do not drift.
28. As a developer, I want chart colors and legends defined, so that analytics are accessible and theme-aware.
29. As a QA reviewer, I want a checklist for light/dark screenshots, so that visual approval is repeatable.
30. As a QA reviewer, I want interactive modal and sheet checks, so that the catalog does not hide behavior problems.
31. As a QA reviewer, I want compact-phone checks, so that overflow and overlap are caught early.
32. As a QA reviewer, I want NativeWind/style discipline checked, so that the playground does not normalize fragile styling.
33. As a future implementation agent, I want existing mobile screen refactors to be out of scope until approval, so that this phase stays focused.
34. As a future implementation agent, I want a separate ticket set after approval, so that screen compliance work can happen in controlled slices.

## Implementation Decisions

- The scope is mobile-only. Dashboard, storefront, POS, and marketing design-system alignment are out of scope for this spec.
- The first approved deliverable is an internal Expo design-system playground and supporting pattern screens.
- Existing mobile product screens should not be globally refactored as part of this first playground implementation.
- The playground should be available through a dev/internal route, preferably named `design-system`, with production exposure guarded during implementation.
- The playground should use a catalog home plus drill-in pattern screens rather than one very long static page.
- The catalog home should group Tokens, Typography, Headers, Actions, Forms, Lists, Status, Modals/Sheets, Navigation/Footers, Analytics, and Retail Ops Patterns.
- The playground should curate the current mobile primitive library instead of creating a separate component set.
- The audit source of truth should include existing mobile exports, theme tokens, NativeWind variables, global styles, and flow-specific primitive modules.
- Canonical keepers include the shared action, form, screen, shell, status, empty state, quantity, OTP, dashboard, report, sale, session, setup, share-link, sync, and base UI primitives.
- The audit should classify each inspected primitive or local widget as keep canonical, fold into another primitive, rename later, deprecate, or ignore.
- The semantic token direction should remain light-first with a complete dark-mode counterpart.
- Light mode should use a bright operational canvas, white cards, deep teal primary actions, green success states, amber warning/money states, red destructive states, and muted dividers.
- Dark mode should use a matte near-black canvas, charcoal cards, crisp foreground text, muted secondary copy, teal primary actions, green success states, amber warning states, and red destructive states.
- Layout density should be compact and operational: divider-based rows, rounded surfaces, full-pill selectable controls, restrained shadows, clear hierarchy, and 44px minimum tap targets.
- Typography examples should cover large totals, screen titles, section headers, row titles, metadata, helper text, error text, badges, and button labels.
- The playground should display major component states: default, pressed, selected, disabled, loading, empty, error, offline, pending, success, warning, destructive, and keyboard-open where relevant.
- Interactive demonstrations should be real interactions, not screenshots inside the app.
- Modal examples should include at least a neutral confirmation and a careful destructive confirmation.
- Bottom-sheet examples should include a keyboard-aware form sheet and an operational action sheet.
- Footer examples should include sticky bottom action, two-action footer, and passive footer/help text patterns.
- Navigation examples should include links from the catalog to list, header, detail, and Retail Ops pattern screens.
- Analytics examples should include KPI tiles, report metric tiles, bounded report rows, compact filters, a vertical bar chart, legend, and empty/loading/error chart states.
- Analytics sample data should use Retail Ops concepts: sales today, cash/transfer split, low stock, staff sessions, share-link views/orders, sync conflicts, and inventory movement.
- If no chart library is already accepted, the first playground implementation should prefer a lightweight view-based or native/SVG bar chart before adding dependency weight.
- Gemini should be used as an advisory reviewer after screenshots or a walkthrough exists; `/opt/homebrew/bin/gemini` is available locally.
- Gravity should have a discovery step before use because no `gravity` command was found on PATH during planning.
- Model critique notes should be stored with the Wayfinder artifacts and treated as recommendations, not approval.
- Any disagreement between model feedback and the project owner should return to the project owner for the final decision.
- The final approval gate should require playground screenshots or walkthrough evidence, light/dark review, compact-phone review, interactive modal/sheet review, keyboard-safe sheet review, analytics review, model critique notes where available, and explicit owner approval before existing screens are refactored.

## Testing Decisions

- Tests should verify the playground as an approval surface from the outside: route availability, visible sections, interactive examples, theme switching, and expected sample states.
- The highest useful implementation seam is a mobile source QA script plus hands-on Expo review that confirms the catalog route, section names, interactive examples, and guardrails.
- Existing mobile QA patterns should be reused where possible, especially source checks for design foundation, theme colors, action primitives, keyboard coverage, NativeWind/style discipline, and typechecks.
- Visual QA should capture light and dark mode screenshots for the catalog home and key pattern screens.
- Compact-phone QA should verify text fit, touch target stability, sticky footer behavior, chart readability, and no overlapping controls.
- Modal QA should verify open, close, destructive action, disabled/loading action, and dark-mode rendering.
- Bottom-sheet QA should verify open, close, keyboard-open fields, bottom action visibility, safe-area spacing, and dark-mode rendering.
- Analytics QA should verify KPI cards, report rows, bar chart, legend, compact filters, and empty/loading/error chart states.
- Accessibility QA should verify that status meaning is not color-only, tap targets are at least 44px, buttons have clear labels, and text remains readable in both themes.
- NativeWind/style QA should scan new playground components for unnecessary className plus style mixing.
- Model-review QA should verify that Gemini notes and Gravity discovery results are captured as artifacts before final approval is requested.
- The playground should not require schema, API, database, auth, sync, or billing tests because it uses static sample data and existing primitives.

## Out of Scope

- Refactoring existing mobile product screens to match the playground.
- Building dashboard, storefront, POS, or marketing design-system catalogs.
- Changing database schema, API contracts, auth flows, sync semantics, subscriptions, or product domain rules.
- Adding production analytics data pipelines or chart APIs.
- Choosing a final brand identity beyond mobile UI token and component decisions needed for this playground.
- Making Gemini or Gravity the final approver.
- Publishing implementation tickets without project-owner approval of the ticket breakdown.

## Further Notes

- This spec comes from the approved Wayfinder issue comments in the mobile design-system playground map.
- The existing broader mobile UI redesign Wayfinder remains useful context, but this spec narrows the next implementation to the design-system approval surface.
- After the playground is implemented and approved, a separate Wayfinder/ticket pass should review existing mobile screens and bring them into compliance.
