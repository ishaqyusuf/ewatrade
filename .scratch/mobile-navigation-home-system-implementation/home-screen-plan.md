# Mobile Home Screen Plan

## Goal

Reduce the mobile Retail Ops dashboard to role-specific home screens that follow the approved Design 01 home language: primary hero, workspace search, deliberate service categories, raised center action, and a short bottom tab dock.

## Admin Home

- Hero: business selector, admin label, daily sales total, sales count, stock alert count, active rep count, and a reports CTA.
- Search: opens customer/workspace lookup first; global search can replace this when the search system lands.
- First content block: service categories for Sales, Stocks, Sales Reps, and Customers.
- Current operations: one compact owner-attention panel for inventory setup/status, latest sale, rep sessions, and closeout queue.
- Bottom tabs: `Home`, `Sales`, `+`, `Stocks`, `More`.
- Center `+`: opens a short Create picker for New sale, Stock entry, and Sales rep.
- More: opens Sales Reps, Customers, Settings, and Theme.

## Sales-Rep Home

- Hero: business selector, sales-rep label, shift sales total, shift state, closeout queue, and a primary sale/clock-in CTA.
- Search: opens customer lookup and recent customer activity.
- First content block: shift task panel for clock-in, sale, customers, closeout, and assigned stock.
- Secondary content: customer book and recent sales only.
- Hidden admin tools: Sales Reps, broad reports, subscription, business settings, share links, and broad stock movement controls.

## CTA And Modal Rules

- Bottom sheets are only for short action choosers or bounded lists under roughly half screen height.
- Keyboard-heavy, multi-section, or workflow content uses a full-screen stack modal route.
- Full-screen form routes use a clear header, keyboard-safe scroll body, sticky primary CTA where the form is long, secondary close/back action, loading state, and validation state.
- Inputs use the shared auth-style `FormField`; numeric exceptions use `QuantityStepper` with the same rounded shell behavior.

## Follow-On Route Targets

- Existing sheet-backed long workflows should move toward stack modal routes in this order: first product setup, stock intake, closeout, reports, product links, subscription/settings, and sync conflict review.
- The legacy sheet components can stay temporarily as compatibility wrappers while their content is extracted into reusable route content.
