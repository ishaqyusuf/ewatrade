# Wayfinder: Mobile Design System Playground

## Destination

Create an approval-ready blueprint for a mobile-only EwaTrade design-system playground screen in `apps/mobile`. The blueprint should define what the screen must contain, how light and dark mode are reviewed, which primitives and patterns are canonical, how sample analytics/charts are represented, and how user approval gates the later refactor of existing mobile screens.

The destination is a planning and decision trail. It should not refactor existing screens or build the playground until the Wayfinder decisions make the first implementation slice clear.

## Notes

- Scope is mobile-only for now. Dashboard, storefront, POS, and marketing design-system alignment are later efforts.
- Primary app surface: `apps/mobile`, Expo Router, React Native, NativeWind, existing mobile primitives, and `apps/mobile/DESIGN.md`.
- Primary product context: `.brain/features/retail-ops-design-system-and-ia.md` and `.brain/features/mobile-retail-ops-mvp-spec.md`.
- Prior design context: `.scratch/wayfinder-mobile-ui-redesign/` defines the broader mobile redesign direction; this map narrows the work to an approvable component playground and design-system foundation.
- Use `agency-design` with the UI Designer framing: component-library oriented, accessible, consistent, implementation-aware, and approval-ready.
- Use Gemini and Gravity as advisory local model reviewers during the design-system process. Their feedback should be captured as critique input, but final design approval remains human approval from the project owner.
- Standing visual direction: light-first operational commerce UI with a complete matte dark-mode counterpart, deep teal/green primary actions, near-black floating/navigation structure, restrained amber for money/warning/pending states, compact rounded surfaces, pill filters, bottom sheets, haptic controls, and keyboard-safe forms.
- The eventual playground should include at minimum: tokens, typography, headers, buttons/icon buttons, inputs, selectors, lists, empty/loading/error states, status badges/banners, modals, bottom sheets/footers, navigation/footer patterns, analytics cards, bar charts, and links to pattern/detail screens.

## Tickets

- [ ] [Audit existing mobile primitives, tokens, and screen patterns](01-audit-existing-mobile-primitives-tokens-and-screen-patterns.md)
- [ ] [Decide playground information architecture and approval flow](02-decide-playground-information-architecture-and-approval-flow.md)
- [ ] [Lock mobile theme tokens, typography, spacing, and density rules](03-lock-mobile-theme-tokens-typography-spacing-and-density-rules.md)
- [ ] [Define canonical primitive and component inventory](04-define-canonical-primitive-and-component-inventory.md)
- [ ] [Define modal, sheet, footer, navigation, and pattern-preview behavior](05-define-modal-sheet-footer-navigation-and-pattern-preview-behavior.md)
- [ ] [Define analytics, chart, and operational data visualization patterns](06-define-analytics-chart-and-operational-data-visualization-patterns.md)
- [ ] [Plan Gemini and Gravity critique loop for the playground](07-plan-gemini-and-gravity-critique-loop-for-the-playground.md)
- [ ] [Assemble implementation blueprint, QA gates, and approval checklist](08-assemble-implementation-blueprint-qa-gates-and-approval-checklist.md)

## Decisions so far

- Scope is mobile-only for the first design-system effort.
- The first deliverable is an approval-ready design-system playground screen and supporting pattern screens, not an immediate refactor of existing mobile product screens.
- Existing screens will be reviewed and brought into compliance only after the design-system screen is approved.

## Not yet specified

- Exact playground route name, navigation entry point, and whether it is dev-only, internal-only, or temporarily visible in the app.
- Exact token values, typography scale, spacing/radius choices, chart colors, and dark-mode color pairings.
- Exact component names and whether any primitives should be renamed, split, or deprecated.
- Exact screen sections and sample data shown in the playground.
- Whether the first implementation should use one long catalog screen, tabs, nested pattern screens, or a hybrid.
- How Gemini and Gravity are invoked locally and where their critique notes are stored.
- Final visual approval artifacts: screenshots, video walkthrough, Expo preview, or a written checklist.
- Rollout order for updating existing mobile screens after approval.

## Out of scope

- Refactoring existing mobile screens before the playground design system is approved.
- Building dashboard, storefront, POS, or marketing design-system screens in this first map.
- Changing API contracts, database schema, auth flows, sync semantics, subscriptions, or product domain rules.
- Choosing final brand identity beyond the mobile UI token and component decisions needed for the playground.
