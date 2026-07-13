# Wayfinder: Standard Dashboard System

## Destination

Create a handoff-ready implementation blueprint for the EwaTrade web dashboard and installable desktop wrapper. The blueprint should explain how to start from the HalalVest dashboard where it accelerates delivery, while converging strictly on the Midday dashboard architecture, UI structure, table system, sheets/modals/forms/search patterns, sidebar/header layout, API approach, performance expectations, and optional Tauri desktop packaging.

The destination is a plan and decision trail, not implementation. No dashboard code should be copied, moved, or rewritten from this Wayfinder map alone.

## Notes

- Primary reference for the required dashboard standard: `/Users/M1PRO/Documents/code/_kitchen_sink/midday`.
- Primary fast-start reference: `/Users/M1PRO/Documents/code/halaal-coperative`.
- Current EwaTrade app surface: `apps/dashboard` already exists with `(shell)` pages, setup, settings, analytics, tRPC client/server helpers, and a first Retail Ops reports screen.
- Current product scope should reuse the mobile Retail Ops feature boundary: signup, onboarding, business/store switching, product and catalog management, inventory, inbounds/stock movements, sales, staff, payroll or payout planning, analytics/reporting, shared links, subscriptions, settings, and sync/conflict visibility.
- Standing architecture preference: follow Midday folder/file organization and component arrangements whenever possible; do not invent a parallel dashboard architecture.
- Standing API preference: use focused Hono/tRPC API routes, services, and repository/query modules. Avoid server actions for business workflows except where a later decision explicitly keeps a small framework-native read/write boundary.
- Standing UI preference: Midday-style sidebar, header, search-anything command surface, tables, forms, sheets, modals, charts, onboarding, and desktop app wrapping.
- Locale/i18n should be investigated against Midday. If copying HalalVest as a fast start makes locale support impractical for the first slice, the map should make that tradeoff explicit rather than letting it drift.
- Planning should preserve laptop/desktop web as the first-class experience. Mobile app behavior remains the source product scope, not the dashboard UI template.

## Tickets

- [ ] [Audit current EwaTrade, HalalVest, and Midday dashboard structures](01-audit-current-ewatrade-halalvest-and-midday-dashboard-structures.md)
- [ ] [Decide the HalalVest fast-start boundary and migration path](02-decide-halalvest-fast-start-boundary-and-migration-path.md)
- [ ] [Define the Midday dashboard architecture compliance blueprint](03-define-midday-dashboard-architecture-compliance-blueprint.md)
- [ ] [Decide dashboard IA, route map, and role-based navigation](04-decide-dashboard-ia-route-map-and-role-based-navigation.md)
- [ ] [Decide web auth, signup, onboarding, and business switching flow](05-decide-web-auth-signup-onboarding-and-business-switching-flow.md)
- [ ] [Define dashboard API contracts and server-action boundary](06-define-dashboard-api-contracts-and-server-action-boundary.md)
- [ ] [Decide the Midday table system adaptation for Retail Ops domains](07-decide-midday-table-system-adaptation-for-retail-ops-domains.md)
- [ ] [Decide forms, sheets, modals, and global registration patterns](08-decide-forms-sheets-modals-and-global-registration-patterns.md)
- [ ] [Decide analytics, reporting, charts, and dashboard KPI surfaces](09-decide-analytics-reporting-charts-and-dashboard-kpi-surfaces.md)
- [ ] [Decide search-anything scope and command behavior](10-decide-search-anything-scope-and-command-behavior.md)
- [ ] [Decide desktop wrapper strategy using Midday desktop](11-decide-desktop-wrapper-strategy-using-midday-desktop.md)
- [ ] [Assemble implementation phases, QA gates, and acceptance criteria](12-assemble-implementation-phases-qa-gates-and-acceptance-criteria.md)

## Decisions so far

- No ticket decisions resolved yet. The initial map accepts the user's direction that Midday is the governing dashboard standard and HalalVest is a fast-start reference to evaluate before implementation.

## Not yet specified

- Exact files, folders, and packages to copy or port from HalalVest.
- Whether EwaTrade should adopt Midday locale routing immediately or defer locale support until after the first dashboard slice.
- Exact dashboard route names, nested layouts, page group names, and sidebar ordering.
- Final payroll/payout scope for the first dashboard implementation.
- Exact search result sources, keyboard shortcuts, and permission filters.
- Exact charting primitives and analytics query boundaries.
- Exact desktop bundle identifiers, signing/notarization setup, updater behavior, and release profiles.
- Whether the implementation should be one scaffold migration followed by feature tickets, or a route-by-route migration that keeps the current dashboard working throughout.

## Out of scope

- Copying or modifying dashboard code inside this Wayfinder charting pass.
- Database schema changes, Prisma migrations, or production DB commands before the dashboard implementation plan requires them.
- Replacing the mobile app product scope or redesigning mobile screens.
- Opening a broad customer marketplace, full customer app, or dispatch marketplace as part of the dashboard standardization plan.
- Choosing final subscription prices, payment providers, payroll providers, or desktop distribution channels unless a ticket narrows that choice into a dashboard implementation dependency.
