# Dashboard Standard System

## Purpose

Define the planning track for a standard EwaTrade web dashboard and optional desktop wrapper for laptop and desktop-first users.

## Current Phase

Planning is active through `.scratch/wayfinder-dashboard-standard-system/map.md`.

A ready-for-agent product spec has been published at `.scratch/wayfinder-dashboard-standard-system/spec.md`.

Ready-for-agent implementation tickets have been published under `.scratch/wayfinder-dashboard-standard-system/issues/`.

The dashboard reference audit for ticket 01 is complete at `.scratch/wayfinder-dashboard-standard-system/reference-audit.md`.

Ticket 02 shell/auth implementation is in progress. The dashboard now has a Midday-style fixed sidebar plus sticky header, role-aware navigation policy, profile/sign-out controls, and tenant/store workspace controls. The dashboard app root placeholder has been removed so authenticated `/` requests resolve through the `(shell)` dashboard route. Browser/HTTP QA now covers unauthenticated redirect, login, shell load, owner role navigation rendering, logout, and active-store endpoint behavior. Full business switching and multi-store UI switching still require a seeded multi-tenant, multi-store QA fixture.

Ticket 03 product catalog proof slice is complete. `/products` now uses a reusable dashboard table, a reusable right-side sheet, and dashboard product API bridge routes for selected-store list/search/status filtering, create, edit, validation errors, and default-unit price history updates. The slice preserves the Retail Ops product model by creating products through the existing product setup helper and updating default-unit prices through the existing price-history helper.

Ticket 04 inventory operations slice is complete. `/inventory` now exposes a dashboard stock operations workbench with product/unit stock rows, available/reserved quantities, low-stock and out-of-stock filtering, stock intake, stock adjustment, unit conversion sheets, and stock movement history. `GET /api/inventory` and `POST /api/inventory` are authenticated dashboard bridge routes that resolve the active tenant/store and call the existing Retail Ops stock movement, intake, adjustment, and unit-conversion helpers.

Ticket 05 staff management slice is complete. `/staff` now exposes a dashboard staff management workbench with staff summary cards, role/status/search filtering, active/invited/suspended membership rows, invite sheet, and suspend/reactivate actions. `GET /api/staff` and `POST /api/staff` are authenticated dashboard bridge routes that resolve the active tenant/store and call the existing Retail Ops staff list, invite, status update, and invite-notification helpers.

Ticket 06 sales, sessions, customers, and closeout review slice is complete. `/sales` now exposes a dashboard sales operations workbench with recent sales, credit sale counts, cashier sessions, payment reconciliation, closeout review state, and variance summary. `/customers` now exposes a searchable customer book table. `GET /api/sales` and `GET /api/customers` are authenticated dashboard bridge routes that resolve the active tenant/store and call the existing Retail Ops sales, credit sales, customer book, sessions, and payment reconciliation query helpers with the same role-aware actor scoping as the production tRPC procedures.

The current direction is:

- Use `/Users/M1PRO/Documents/code/halaal-coperative` as the fast-start dashboard reference where it accelerates implementation.
- Use `/Users/M1PRO/Documents/code/_kitchen_sink/midday` as the strict dashboard architecture, UI, table, sheet, modal, search, analytics, layout, API, locale, and performance reference.
- Preserve the existing EwaTrade product scope from Retail Ops mobile and reporting work instead of creating a separate dashboard-only product model.
- Prefer focused Hono/tRPC API contracts, service boundaries, and repository/query modules over business workflow server actions.
- Include a future installable desktop wrapper based on Midday's `apps/desktop` approach.

Resolved audit guidance:

- HalalVest can accelerate auth, public login/onboarding flow, workspace shell, table, sheet, modal, report, and filter implementation, but production code should be ported through Midday conventions instead of copied as-is.
- Midday remains the governing standard when HalalVest and Midday disagree.
- Locale/i18n is deferred for the first dashboard scaffold because the current EwaTrade dashboard and HalalVest reference are non-locale; new copy should still be centralized enough to move into Midday-style locale files later.
- The current EwaTrade route handlers for logout, stores, and active tenant/store may remain as temporary shims while the shell/auth ticket standardizes the dashboard.
- The current retail reports component may remain as a temporary shim, but should not be expanded before the analytics ticket decomposes it into Midday-style focused components.
- Dashboard middleware should redirect unauthenticated users to the marketing login page with `next` preserved, while server components and route handlers continue to validate the real Better Auth session.
- Role-aware dashboard navigation is centralized in `apps/dashboard/src/lib/navigation.ts`; owner/admin users see full shell navigation, managers see operational administration without owner-only settings, cashier/operator users see permitted work surfaces, and support/member roles are limited to overview.
- The dashboard logout, active tenant, active store, and store creation route handlers are retained as migration bridges until the typed API surface fully covers those shell workflows.
- The dashboard product catalog route handlers are retained as proof-slice migration bridges until the typed dashboard API surface fully covers product list, create, and edit workflows.
- The dashboard inventory bridge route handlers are retained as proof-slice migration bridges until the typed dashboard API surface fully covers inventory list, movement history, stock intake, stock adjustment, and unit conversion workflows.
- The dashboard staff bridge route handlers are retained as proof-slice migration bridges until the typed dashboard API surface fully covers staff list, invite, status update, and onboarding follow-up workflows.
- The dashboard sales and customer bridge route handlers are retained as proof-slice migration bridges until the typed dashboard API surface fully covers sales review, customer book, cashier sessions, payment reconciliation, and closeout variance review workflows.

## Planned Dashboard Scope

- Signup, login, onboarding, and first business/store setup.
- Business and store switching.
- Product registration and catalog management.
- Inventory, stock movements, inbounds, and unit/variant operations.
- Sales, customers, generated product links, and shared-link follow-up.
- Staff management and payroll or payout planning.
- Analytics, reports, KPIs, charts, exports, sync history, and conflict review.
- Subscription and settings surfaces.
- Midday-style sidebar, header, search-anything command surface, tables, forms, sheets, modals, and desktop-friendly responsive behavior.

## Open Planning Questions

- Seeded multi-tenant, multi-store browser fixture for ticket 02 business switching and store switching QA.
- Seeded non-empty sales, cashier session, payment reconciliation, closeout variance, and customer-book browser fixture for ticket 06 table-content QA.
- Dashboard-only API gaps.
- Desktop wrapper packaging and release path.

## Related Docs

- `.scratch/wayfinder-dashboard-standard-system/map.md`
- `.scratch/wayfinder-dashboard-standard-system/spec.md`
- `.scratch/wayfinder-dashboard-standard-system/issues/`
- `.scratch/wayfinder-dashboard-standard-system/reference-audit.md`
- `.brain/decisions/ADR-0002-midday-inspired-monorepo-architecture.md`
- `.brain/features/mobile-retail-ops-mvp-spec.md`
- `.brain/features/retail-ops-sales-product.md`
- `.brain/features/retail-ops-reporting.md`
