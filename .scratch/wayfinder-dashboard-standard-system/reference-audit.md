# Dashboard Reference Audit And Adoption Blueprint

Status: implementation-complete for ticket 01
Source ticket: `.scratch/wayfinder-dashboard-standard-system/issues/01-dashboard-reference-audit-and-adoption-blueprint.md`
Date: 2026-07-13

## Purpose

This audit gives dashboard implementers one reference point before changing product code. EwaTrade should move quickly by reusing the shape of the HalalVest dashboard where it fits, but the governing standard is Midday: route grouping, shell composition, tables, sheets, modals, search, analytics, API layering, and desktop packaging should be judged against Midday first.

## Reference Roots

- EwaTrade dashboard: `/Users/M1PRO/Documents/code/ewatrade/apps/dashboard`
- EwaTrade API: `/Users/M1PRO/Documents/code/ewatrade/apps/api`
- HalalVest dashboard reference: `/Users/M1PRO/Documents/code/halaal-coperative/apps/dashboard`
- HalalVest API reference: `/Users/M1PRO/Documents/code/halaal-coperative/apps/api`
- Midday dashboard target: `/Users/M1PRO/Documents/code/_kitchen_sink/midday/apps/dashboard`
- Midday desktop target: `/Users/M1PRO/Documents/code/_kitchen_sink/midday/apps/desktop`

## Current EwaTrade Dashboard Snapshot

The current dashboard is intentionally small and should be treated as a seed, not the final architecture.

- Shell: `apps/dashboard/src/app/(shell)/layout.tsx` protects authenticated routes, loads `getServerSession`, loads `getActiveTenant`, redirects users without stores to `/setup`, and renders `DashboardSidebar`.
- Routes: current shell pages are overview, analytics, and settings under `apps/dashboard/src/app/(shell)`. Setup lives outside the shell at `apps/dashboard/src/app/setup/page.tsx`.
- Auth bridge: logout is implemented as `apps/dashboard/src/app/api/auth/logout/route.ts`; login currently redirects to the marketing URL.
- Workspace bridge: active tenant and store route handlers exist at `apps/dashboard/src/app/api/tenants/active/route.ts`, `apps/dashboard/src/app/api/stores/active/route.ts`, and `apps/dashboard/src/app/api/stores/route.ts`.
- Providers: `apps/dashboard/src/app/providers.tsx` only installs `TRPCReactProvider`.
- Sidebar: `apps/dashboard/src/components/dashboard/sidebar.tsx` includes inline tenant/store switching, basic navigation, and logout.
- Analytics: `apps/dashboard/src/components/dashboard/retail-ops-reports.tsx` is a useful product/reporting proof, but it is monolithic and should be decomposed during the analytics ticket.
- API client: tRPC helpers are present under `apps/dashboard/src/trpc`, including server and client callers.
- Missing standard system: there is no dashboard table core, global sheets provider, global modal registry, search-anything command surface, locale route layer, or desktop wrapper yet.

## HalalVest Fast-Start Snapshot

HalalVest is the best starting reference for a working dashboard because it already has many of the primitives EwaTrade needs. It should accelerate implementation, but product code should still be ported through Midday conventions instead of copied blindly.

- Route structure: `src/app/(app)/(sidebar)` contains the authenticated dashboard area; `src/app/(public)` contains login, reset, signup, and approval pages.
- Auth: route handlers live under `src/app/auth/*` and public login UI lives at `src/app/(public)/login`.
- API bridge: dashboard tRPC route is `src/app/api/trpc/[...trpc]/route.ts`; API routers live under `apps/api/src/routers`.
- Shell: `src/components/dashboard-shell.tsx` and `src/components/dashboard/*` provide dashboard shell, sidebar, topbar, workspace shell, sections, cards, and empty states.
- Navigation: navigation is centralized in `src/lib/navigation/*`.
- Tables: `src/components/tables/core` contains shared table primitives; domain tables live beside columns, headers, skeletons, empty states, and data-table files.
- Sheets: `src/components/sheets/global-sheets.tsx` and `global-sheets-provider.tsx` register domain sheets such as import, business, charge, and share sheets.
- Modals: domain modal components live under `src/components/modals`.
- Forms: reusable dashboard forms live under `src/components/forms`.
- Analytics/reports: route-level report pages and export routes are already split under `(app)/(sidebar)/reports`.
- Search/filter: HalalVest has a strong reusable search-filter system, but not the same search-anything surface as Midday.
- Locale: HalalVest does not use Midday's `[locale]` route layer.

## Midday Target Snapshot

Midday is the final architecture and UI target. When HalalVest and Midday disagree, prefer Midday unless an EwaTrade Brain decision says otherwise.

- Routes: authenticated dashboard routes live under `apps/dashboard/src/app/[locale]/(app)/(sidebar)`, with public routes under `apps/dashboard/src/app/[locale]/(public)`.
- Providers: `apps/dashboard/src/app/[locale]/providers.tsx` installs the dashboard-level client provider stack.
- Locale: `apps/dashboard/src/locales` defines the locale system, and app routes are locale-aware.
- Sidebar shell: `(app)/(sidebar)/layout.tsx` is the canonical shell shape for sidebar-driven desktop usage.
- Tables: `src/components/tables/core` owns shared table primitives, while domain folders such as `products`, `customers`, `invoices`, and `transactions` own columns, headers, skeletons, empty states, and data tables.
- Sheets: `src/components/sheets/global-sheets.tsx` and `global-sheets-provider.tsx` register global sheets including product, customer, tracker, document, invoice, and transaction sheets.
- Modals: `src/components/modals` contains global and domain modal components.
- Search anything: `src/components/search/search.tsx`, `search-modal.tsx`, and `open-search-button.tsx` define the target search pattern.
- Stores and params: `src/store/*` and `src/hooks/use-*-params.ts` hold client UI state and URL/filter state.
- Analytics: reports, metric content, filters, and chart components are split into smaller query-aware components instead of one large page component.
- Desktop wrapper: `apps/desktop` uses a Tauri wrapper with `src/main.tsx`, `src-tauri/tauri.conf.json`, dev/staging configs, capabilities, icons, and package scripts.
- Server actions: Midday uses actions for specific cross-boundary UI workflows, but EwaTrade should keep business workflows in typed APIs/services unless an exception is documented.

## Decision Matrix

| Area | Decision | Reference | Implementation guidance |
| --- | --- | --- | --- |
| Auth and session bridge | Port | HalalVest first, then Midday shell gating | Align ticket 02 with HalalVest-style dashboard auth routes and public login/onboarding flow, while preserving EwaTrade session and tenant/store rules. |
| Dashboard route groups | Port | Midday | Move toward `(app)/(sidebar)` and public route groups. Do not introduce `[locale]` in the first shell slice. |
| Sidebar and header | Port | Midday primary, HalalVest secondary | Use Midday layout density, sidebar behavior, and header/search placement. HalalVest can guide workspace switcher wiring. |
| Workspace switching | Port | Existing EwaTrade plus HalalVest | Keep EwaTrade tenant/store semantics. Rework UI into the Midday-style shell instead of copying HalalVest cooperative concepts. |
| Table core | Port | Midday primary, HalalVest compatible | Create `components/tables/core` and domain table folders in the Midday pattern. HalalVest table files can speed up implementation where APIs differ only by data shape. |
| Domain tables | Port | Midday | Each table page should have columns, data table, table header, empty state, skeleton, row actions, and optional bottom bar/action menu. |
| Sheets | Port | Midday primary, HalalVest compatible | Add a global sheets provider and registry. Domain create/edit/detail workflows should open in sheets before adding bespoke pages. |
| Modals | Port | Midday primary | Use a global modal registry for cross-cutting modals and domain modal components only where a sheet is not the right interaction. |
| Forms | Port | Midday primary | Use typed schemas, form hooks, mutation invalidation, optimistic UI where safe, and shared field primitives. |
| Analytics and reports | Port and refactor | Existing EwaTrade plus Midday | Keep EwaTrade retail metrics and API procedures, but split the current reports component into Midday-style charts, filters, export controls, and loading states. |
| Search/filter controls | Port | Midday for search-anything, HalalVest for page filters | Use Midday for global command search. Use HalalVest search-filter ideas for page-level filters only after adapting styling and URL state. |
| Desktop wrapper | Defer | Midday | Do not begin until the web shell and primary dashboard flows are stable. Later mirror Midday `apps/desktop` Tauri structure. |
| Locale/i18n | Defer | Midday | Keep routes non-locale for initial implementation. Isolate copy and route helpers so `[locale]` can be adopted before public desktop release. |
| Cooperative/member modules | Skip | HalalVest | Do not port finance, member, share, contribution, cooperative loan, or guarantor domain behavior unless it maps directly to EwaTrade retail operations. |
| Banking/accounting modules | Skip | Midday | Do not port Midday banking, inbox, vault, tracker, or invoicing product behavior unless a later EwaTrade ticket explicitly asks for the concept. |
| Current route handlers | Temporary shim | EwaTrade | `/api/auth/logout`, `/api/stores`, and `/api/tenants/active` may remain while ticket 02 builds the standard shell. Replace or wrap them once typed APIs cover the flow. |
| Current reports component | Temporary shim | EwaTrade | Keep it working until the analytics ticket decomposes it. Do not expand the monolith. |

## Midday Compliance Checklist

Later dashboard tickets should cite this checklist before implementation.

- Route files are placed in the closest Midday-equivalent route group and do not create extra app roots.
- Dashboard pages are server-first where possible, with client components isolated to interaction-heavy controls.
- The sidebar shell owns global navigation, workspace context, header/search affordances, and global sheets/modals providers.
- API reads and mutations use typed tRPC/Hono contracts, service modules, and repository/query modules for business behavior.
- Server actions are not used for core business workflows unless the ticket documents the exception.
- Tables use `components/tables/core` plus domain folders for columns, data-table, table-header/header, skeleton, empty-states, row actions, and optional bottom-bar.
- Table filtering and sorting state is URL-aware where the page is intended to be shareable or reload-safe.
- Sheets are registered in `components/sheets/global-sheets.tsx` and mounted through a provider.
- Modals are registered globally only when they are cross-cutting; domain-only modal files stay near the domain.
- Forms use typed validation, clear loading/disabled states, mutation invalidation, and accessible field labels/errors.
- Analytics is built from focused chart, metric, filter, export, and empty/loading components.
- Search-anything uses a central command/search surface, not page-specific search boxes only.
- Loading, empty, permission-denied, and error states are designed as first-class dashboard states.
- Role, tenant, and store scoping is checked at the API/service layer and reflected in navigation visibility.
- Locale is not required for the first scaffold slice, but new copy should be easy to extract.
- Desktop-specific code stays out of the web dashboard until the desktop-wrapper ticket starts.
- Brain docs are updated when route architecture, API contracts, auth/permission behavior, or feature scope changes.

## Locale Timing Decision

Locale/i18n is deferred for the initial dashboard implementation.

Rationale:

- EwaTrade currently has non-locale dashboard routes.
- HalalVest, the fast-start reference, is also non-locale.
- Moving to Midday's `[locale]` route layer before the shell, auth, tables, sheets, and search are stable would multiply route churn.
- The first implementation goal is a working laptop-first retail operations dashboard, not a public multilingual surface.

Implementation constraint:

- New shared labels, nav item names, table headers, and empty-state copy should be centralized enough to move into a locale file later.
- The desktop wrapper ticket should revisit `[locale]` adoption before packaging a public installable build.

## Recommended Implementation Order

1. Align auth, dashboard shell, route groups, sidebar, header, onboarding gate, and workspace switching.
2. Build products as the proof slice for table core, sheets, forms, mutations, loading states, and empty states.
3. Expand the table/sheet system into inventory, inbounds, and stock movements.
4. Add staff management and role administration.
5. Add sales sessions, customers, closeout review, generated links, and follow-up surfaces.
6. Refactor analytics and reports into Midday-style focused components.
7. Add search-anything across products, inventory, customers, staff, reports, settings, and businesses.
8. Add settings, subscription, payroll, and payout planning surfaces.
9. Add the Midday-style desktop wrapper after the web shell is stable.
10. Run final browser workflow QA, contract tests, Brain handoff, and issue closure.

## Validation Notes

This audit was validated against actual file trees in EwaTrade, HalalVest, and Midday. The required acceptance coverage is:

- Structures compared across shell, auth, routes, providers, tables, sheets, modals, forms, analytics, search, and desktop wrapper.
- HalalVest copy/port/skip/temporary-shim decisions documented.
- Midday compliance checklist documented.
- Locale timing documented and deferred with constraints.
- Brain guidance updated to close the previous open planning questions.
