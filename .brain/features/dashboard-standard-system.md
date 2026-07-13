# Dashboard Standard System

## Purpose

Define the planning track for a standard EwaTrade web dashboard and optional desktop wrapper for laptop and desktop-first users.

## Current Phase

Planning is active through `.scratch/wayfinder-dashboard-standard-system/map.md`.

A ready-for-agent product spec has been published at `.scratch/wayfinder-dashboard-standard-system/spec.md`.

Ready-for-agent implementation tickets have been published under `.scratch/wayfinder-dashboard-standard-system/issues/`.

The dashboard reference audit for ticket 01 is complete at `.scratch/wayfinder-dashboard-standard-system/reference-audit.md`.

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

- Dashboard route map and role-based navigation.
- Web onboarding flow and business switching behavior.
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
