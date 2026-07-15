# Spec: EwaTrade Standard Dashboard System And Desktop Wrapper

Status: ready-for-agent
Source map: [Wayfinder: Standard Dashboard System](map.md)

## Problem Statement

EwaTrade already has a strong Retail Ops product direction across mobile, API, reporting, subscriptions, shared product links, offline sync, staff workflows, customer capture, stock operations, and tenant-scoped business management. The web dashboard, however, is still much smaller than the product ambition. Laptop and desktop-first users need a standard, full-featured dashboard experience where they can run the same business workflows with the comfort, density, navigation, tables, reporting, and keyboard-friendly operations expected from a serious web app.

The project also has two strong dashboard references pulling in different directions. HalalVest is useful as a fast-start reference because it already contains a larger dashboard app with similar API connection, table, sheet, page, and auth patterns. Midday is the strict long-term architecture and UI reference: folder organization, sidebar/header, pages, tables, forms, sheets, modals, search-anything, analytics, locale, tRPC patterns, loading/error states, and performance behavior should converge on the Midday style.

Without a clear spec, the dashboard implementation can drift in two risky ways. It can copy HalalVest too directly and create a second architecture that blocks Midday compliance later, or it can try to follow Midday abstractly without shipping the practical EwaTrade workflows merchants need. The project needs a handoff-ready dashboard standard that explains what the web experience should do, how it should behave, which architecture it should follow, and how agents should test it.

## Solution

Build a standard EwaTrade dashboard system for laptop and desktop-first users. The dashboard should let owners, admins, managers, and permitted attendants operate the business from the web: sign up, log in, onboard, create or switch businesses and stores, register products, manage catalogs, review inventory, record inbounds and stock movements, manage sales, review customers, invite staff, plan payroll or payouts, manage subscriptions, inspect generated product links, follow up shared-link orders, review analytics, handle sync issues, and configure settings.

The dashboard should also promote low-stock state from a passive table badge into a first-class operational alert workflow. Owners and managers need to see which products are below reorder level, understand the threshold that triggered the alert, acknowledge or snooze noisy alerts, and move directly into restock, adjustment, or reorder-point changes without hunting through inventory rows.

The implementation should use HalalVest as a practical fast-start reference where it accelerates delivery, especially for auth alignment, dashboard scaffolding, API-connected pages, tables, sheets, modals, and operational layouts. Every imported or adapted pattern must still be reshaped to the Midday standard unless a deliberate and documented exception is approved.

The dashboard should use the same product model as Retail Ops mobile rather than creating a dashboard-only product. Mobile remains a focused operations surface for fast sales and offline work; the web dashboard becomes the fuller control center for administration, analysis, larger tables, exports, setup, and review.

The dashboard should follow the accepted monorepo and domain architecture: client UI calls typed API contracts; API procedures enforce tenant, store, role, and entitlement rules; services own domain behavior; repositories and query modules isolate persistence; Prisma remains the schema source of truth; Drizzle may be used only behind repository/query boundaries. Business workflows should use focused API/tRPC contracts instead of page-local server actions by default.

The dashboard should also support a future installable desktop wrapper based on the Midday desktop approach. The desktop app is not a separate product model; it wraps the same web dashboard experience with EwaTrade branding, environment profiles, auth/session expectations, and platform packaging decisions.

## User Stories

1. As a business owner, I want to use EwaTrade from my laptop, so that I can manage my business on a larger screen.
2. As a business owner, I want the web dashboard to feel like a complete operating system, so that I do not need to depend only on the mobile app.
3. As a business owner, I want the dashboard UI to feel polished and consistent, so that I trust it for serious business work.
4. As a business owner, I want the dashboard to follow the same product model as the mobile Retail Ops app, so that my data and workflows stay consistent across devices.
5. As a business owner, I want to sign up from the web, so that I can create my business workspace without installing the mobile app first.
6. As a business owner, I want web auth to align with the HalalVest approach, so that EwaTrade can start from a proven dashboard auth pattern.
7. As a business owner, I want auth alignment to preserve EwaTrade tenant and store boundaries, so that one business cannot leak into another.
8. As a returning user, I want to log in quickly from the dashboard, so that I can resume work without friction.
9. As a user with multiple businesses, I want to select the correct business after login, so that I work in the right workspace.
10. As a user with multiple stores, I want to switch stores clearly, so that reporting and operations use the intended store context.
11. As a new business owner, I want an onboarding flow that creates the right business and store context, so that the dashboard is usable immediately.
12. As a new Product Sales owner, I want first setup to help me add my first product, unit, price, variants, and starting stock, so that I can start selling.
13. As a new owner, I want first product setup to happen in the right place, so that onboarding is not too heavy but I am not left with an empty dashboard.
14. As an owner, I want a Midday-style sidebar, so that navigation is stable, familiar, and efficient.
15. As an owner, I want the sidebar to include the most important Retail Ops areas, so that product, inventory, sales, staff, customers, analytics, and settings are easy to reach.
16. As an owner, I want a Midday-style header, so that business switching, search, notifications, profile, and workspace controls feel consistent.
17. As an owner, I want the dashboard home to show key business metrics, so that I can understand today's operations quickly.
18. As an owner, I want dashboard KPIs to show sales, payments, stock, pending orders, low stock, staff activity, subscription usage, and sync issues, so that I can act without hunting through reports.
19. As a manager, I want role-appropriate navigation, so that I see operational tools without owner-only billing or destructive settings.
20. As an attendant, I want web access only where permitted, so that I can help with assigned tasks without seeing owner-only business controls.
21. As an admin, I want route visibility to follow role permissions, so that sensitive pages are not exposed by UI links.
22. As a developer, I want route authorization to happen at API and server boundaries too, so that hiding navigation is not the only protection.
23. As an owner, I want to register products from the dashboard, so that catalog setup is comfortable on a larger screen.
24. As an owner, I want to manage product units and variants, so that products can match real selling units such as bag, half bag, carton, piece, or custom units.
25. As an owner, I want product prices to be edited with clear validation, so that price mistakes are harder to make.
26. As an owner, I want product price history to be visible where relevant, so that I can understand past changes.
27. As an owner, I want to search and filter products, so that large catalogs stay manageable.
28. As an owner, I want product tables to use a standard table system, so that every list behaves predictably.
29. As an owner, I want catalog pages to support skeletons, empty states, sorting, filtering, pagination, selection, and action menus, so that the dashboard feels mature.
30. As an owner, I want inventory pages to show stock by product and unit, so that I know what is available.
31. As a manager, I want inventory pages to highlight low stock and out-of-stock units, so that replenishment is easier.
32. As a manager, I want to record stock intake from the dashboard, so that deliveries or inbounds can be entered accurately.
33. As a manager, I want to record unit conversion or rebagging, so that stock transformations are traceable.
34. As a manager, I want to record stock adjustments with reasons, so that damage, loss, correction, or found stock is auditable.
35. As an owner, I want inbound stock pages, so that incoming stock can be planned, recorded, and reviewed separately from sales.
36. As an owner, I want inventory movement tables, so that every stock change can be reviewed later.
37. As an owner, I want sales pages to show recent and historical sales, so that I can review business activity.
38. As an owner, I want sales by attendant, so that I know who recorded each sale.
39. As an owner, I want sales by product and unit, so that I know what is moving.
40. As an owner, I want payment method breakdowns, so that cash, transfer, card, and credit can be reconciled.
41. As a manager, I want cashier session and closeout reports, so that opening stock, closing stock, and declared payments can be reviewed.
42. As an owner, I want stock variance reports, so that discrepancies can be investigated.
43. As an owner, I want customer book pages, so that customers captured from sales and shared product links can be reviewed.
44. As an owner, I want customer search, so that repeat customers are easy to find.
45. As an owner, I want customer history to remain tenant-scoped, so that one business cannot see another business's customer activity.
46. As an owner, I want staff management from the dashboard, so that I can invite, review, suspend, and reactivate workers.
47. As an owner, I want staff roles to be clear, so that cashier, operator, manager, owner, and admin access are not confused.
48. As an invited staff member, I want onboarding to be simple, so that I can start working without using the owner's account.
49. As an owner, I want staff activity reports, so that I can review performance and accountability.
50. As an owner, I want payroll or payout planning to have a place in the dashboard, so that future compensation workflows do not feel bolted on.
51. As an owner, I want payroll/payout pages to be planned even if not fully implemented first, so that the route map can reserve the right navigation space.
52. As an owner, I want generated product links to be manageable from the dashboard, so that shared-link selling is not limited to mobile.
53. As an owner, I want to create product share links from product actions, so that products can be promoted through WhatsApp and other channels.
54. As an owner, I want generated link analytics, so that I can see views, orders, last activity, and conversion signals.
55. As an owner, I want to deactivate generated links, so that stale or incorrect links stop accepting requests.
56. As an owner, I want shared-link order requests visible in the dashboard, so that follow-up can happen from a larger screen.
57. As an owner, I want shared-link follow-up controls, so that payment, pickup, delivery, completion, and cancellation can be handled.
58. As an owner, I want delivery request status surfaced where shared-link orders require delivery, so that fulfillment can be tracked.
59. As an owner, I want subscription state in the dashboard, so that plan, usage, limits, and upgrade handoff are visible.
60. As an owner, I want subscription usage to connect to real business limits, so that I know when products, staff, stores, or devices are near limits.
61. As an owner, I want settings pages, so that business profile, store setup, account, permissions, notifications, and billing configuration can be managed.
62. As an owner, I want analytics pages to be richer than mobile reports, so that laptop users can inspect tables, filters, and exports deeply.
63. As an owner, I want dashboard reports to include date presets and custom ranges, so that I can answer daily, weekly, and monthly questions.
64. As an owner, I want analytics filters for store, attendant, product, unit, payment method, movement type, sync status, device, and closeout state, so that reports can answer real operating questions.
65. As an owner, I want CSV exports, so that I can use report data outside EwaTrade.
66. As an owner, I want browser print or PDF-friendly reports, so that I can preserve or share operational summaries.
67. As a manager, I want sync history in the dashboard, so that I can see which offline events have replayed.
68. As a manager, I want sync conflict review in the dashboard, so that unresolved server conflicts can be acknowledged and investigated.
69. As a manager, I want sync conflict actions to respect permissions, so that only authorized users review business-wide issues.
70. As a user, I want the dashboard to show loading states consistently, so that pages do not feel broken while data loads.
71. As a user, I want error states to be specific and recoverable, so that I understand whether to retry, change filters, or ask an owner/admin.
72. As a user, I want empty states to explain the next useful action, so that new accounts do not feel abandoned.
73. As a user, I want forms to validate clearly, so that I can correct mistakes before submission.
74. As a user, I want forms to show mutation loading and success states, so that I do not submit twice by accident.
75. As a user, I want forms to use consistent sheet and modal behavior, so that creating products, inviting staff, and editing settings feel connected.
76. As a user, I want side sheets for focused work, so that I can create or edit records without losing table context.
77. As a user, I want modals for confirmations and special workflows, so that high-risk actions feel deliberate.
78. As an owner, I want destructive actions to require clear confirmation, so that important records are not changed accidentally.
79. As a developer, I want global sheet registration, so that sheet state does not scatter across every page.
80. As a developer, I want modal registration to follow the same dashboard standard, so that workflows are easy to reason about.
81. As a developer, I want forms to follow Midday-style mutation and invalidation patterns, so that server state stays current after actions.
82. As a developer, I want the dashboard table system to follow the Midday domain table pattern, so that every domain page is built the same way.
83. As a developer, I want domain tables to share core primitives, so that skeletons, empty states, bottom bars, virtual rows, and types are not duplicated.
84. As a developer, I want the first proof tables to establish the pattern, so that later domains can be added quickly.
85. As a developer, I want business logic outside UI components, so that dashboard screens stay thin.
86. As a developer, I want API procedures to call services and repositories, so that domain behavior does not live in page components.
87. As a developer, I want tenant and role checks at API boundaries, so that the dashboard stays secure.
88. As a developer, I want server actions avoided for business workflows, so that API contracts remain typed, reusable, and testable.
89. As a developer, I want any server-action exception documented, so that it does not become a hidden second API style.
90. As a developer, I want tRPC query invalidation and caching to follow Midday conventions, so that dashboard state updates predictably.
91. As a developer, I want HalalVest imports or ports to be reshaped to Midday standards, so that fast-start code does not create permanent architecture drift.
92. As a developer, I want the HalalVest copy/port boundary decided before implementation, so that agents know what is safe to reuse.
93. As a developer, I want locale/i18n timing decided, so that routing and copy structure do not need a disruptive rewrite later.
94. As a user, I want search-anything in the dashboard, so that I can quickly find records, pages, and actions.
95. As a user, I want search to find products, customers, staff, sales, links, settings, and reports where permitted, so that I can move quickly.
96. As a user, I want search actions such as create product or invite staff, so that common operations are keyboard-friendly.
97. As a user, I want search results filtered by tenant, store, and role, so that I only see data I am allowed to access.
98. As a user, I want search empty and error states, so that I understand when no result exists or when search could not load.
99. As an owner, I want the dashboard to be performant with large catalogs and sales tables, so that laptop use remains smooth as the business grows.
100. As a developer, I want long tables to use appropriate pagination or virtualization, so that large datasets do not degrade the dashboard.
101. As a QA reviewer, I want browser-driven workflow checks, so that dashboard behavior is tested through the user-facing experience.
102. As a QA reviewer, I want tRPC contract tests for workflows browser tests cannot prove well, so that API permissions and domain outcomes are protected.
103. As a QA reviewer, I want responsive laptop and desktop viewport checks, so that the dashboard works for common web users.
104. As a QA reviewer, I want table, sheet, modal, form, and search checks, so that core dashboard primitives do not regress.
105. As a QA reviewer, I want analytics export and print checks, so that reporting features are not only visually present.
106. As an operator, I want an installable desktop version, so that EwaTrade can feel like a dedicated business application.
107. As an operator, I want the desktop wrapper to use the same dashboard data and auth model, so that it is not a separate product.
108. As a developer, I want the desktop wrapper strategy to follow Midday's desktop approach, so that packaging starts from a proven structure.
109. As a developer, I want desktop environment profiles, branding, icons, app ids, and auth handoff planned, so that desktop builds can be released deliberately.
110. As a project owner, I want the dashboard implementation broken into phases, so that agents can ship the standard system without one giant risky rewrite.

## Low-Stock Level Alert Extension

- As an owner, I want low-stock level alerts to appear when available stock drops below a reorder threshold, so that I can restock before sales are blocked.
- As a manager, I want each alert to show product, unit or variant, store, available stock, threshold, and age, so that I know what to fix first.
- As an owner, I want to configure reorder points per sellable unit or variant, so that slow and fast-moving items do not share the same threshold.
- As a manager, I want to acknowledge or snooze a low-stock alert, so that the dashboard stays useful while I am already handling a restock.
- As an owner, I want low-stock alerts to resolve automatically after stock rises above the threshold, so that stale alerts do not create noise.
- As an owner, I want notification settings for low-stock alerts, so that in-app alerts can later expand to email or WhatsApp/SMS fallback without changing the workflow.

## Implementation Decisions

- The dashboard standard is a web-first Retail Ops control center for laptop and desktop users. It does not replace the mobile app; it complements it with richer navigation, tables, analytics, exports, setup, and administrative workflows.
- The dashboard must preserve the existing Retail Ops product model. Product, inventory, sales, customer, staff, share-link, subscription, sync, and reporting behavior should not fork into dashboard-only concepts.
- HalalVest is the fast-start reference. It should guide auth alignment, practical dashboard scaffolding, and reusable operational patterns where they accelerate delivery.
- Midday is the governing architecture and UI standard. Pages, layouts, tables, sheets, modals, forms, onboarding, sidebar, header, search, analytics, loading states, error states, data fetching, and performance behavior should converge on the Midday approach.
- Any reused HalalVest pattern must be classified before implementation as safe to copy, safe to port after Midday alignment, safe only as a temporary shim, or skipped.
- The first implementation should not blindly replace the current dashboard. The preferred path is a hybrid: audit current EwaTrade, HalalVest, and Midday structures; establish the Midday compliance blueprint; then migrate route groups and domain surfaces in phases while keeping the dashboard usable.
- Web auth should align with the HalalVest auth approach while preserving EwaTrade tenant, store, session, membership, and role boundaries.
- Existing dashboard route handlers may remain temporarily only when they are part of the migration bridge. The final business workflow direction should move toward focused API/tRPC contracts.
- Business workflow mutations should not default to server actions. Server actions are allowed only when a later decision names a narrow framework-specific reason and documents the exception.
- The dashboard should use typed API procedures for protected business reads and writes. Procedures must enforce tenant, store, role, and entitlement rules.
- API procedures should call service functions, and services should call repository or query modules. UI components must not own domain rules such as authorization, stock mutation, price snapshotting, idempotency, sync conflict semantics, or subscription entitlement checks.
- Prisma remains the schema source of truth. Runtime query tools may be used only behind repository/query boundaries and must not become a second schema authority.
- The dashboard route map should include dashboard home, onboarding/setup, products/catalog, inventory, inbounds/stock movements, sales, customers, staff, payroll or payout planning, generated links, shared-link order follow-up, analytics/reports, subscriptions, settings, sync/conflict review, and search.
- Low-stock level alerts should be a first-class inventory workflow, not just a visual state. Alerts derive from available stock compared with a product/unit reorder point, a business/store default, or the existing fallback threshold, and must preserve tenant, store, role, and entitlement boundaries.
- Low-stock alert lifecycle should support open, acknowledged, snoozed, and resolved states. Repeated reads while an item remains below threshold should update the active alert rather than creating duplicates, and restocking above threshold should remove it from active alert counts.
- The sidebar should be role-aware. Owners/admins see full business, billing, staff, settings, analytics, and destructive management surfaces. Managers see operational administration where permitted. Attendants see only permitted work surfaces.
- Business and store switching should be visible and consistent in the global shell, and it should update the active tenant/store context used by queries.
- The dashboard home should show a compact operational summary, not a marketing landing page.
- Products, inventory, sales, customers, staff, generated links, and analytics drilldowns should use a shared table system based on the Midday domain table pattern.
- Domain tables should provide consistent columns, data table shells, headers, filters, skeletons, empty states, bottom bars or action menus, pagination or virtualization, and export behavior where relevant.
- Initial proof tables should include products, inventory, sales, and staff because they exercise common filters, row actions, permissions, loading states, empty states, and data density.
- Forms should use shared validation, mutation, error handling, success, loading, and cache invalidation conventions.
- Sheets should be registered through a global sheet provider and registry. Domain sheet files should own focused create/edit/review workflows.
- Modals should be registered through a predictable global modal pattern. Modals should be used for confirmations, destructive actions, imports, exports, and special workflows where a sheet is not appropriate.
- Full pages should be used for dense management and reporting screens. Sheets should be used for focused side-work that benefits from preserving table context.
- The dashboard should include search-anything in the Midday spirit. Search should combine navigation, record lookup, and permitted command actions without becoming a broad unbounded indexing project in the first release.
- Search should respect tenant, store, role, and permission boundaries. First-release search should favor high-value records and actions: products, customers, staff, sales, generated links, reports, settings, create product, invite staff, and record stock intake.
- Analytics should start from the current production report surface and Brain reporting definitions, then standardize into dashboard home KPIs plus full reports.
- Dashboard reports should include date presets, custom ranges, store filters, staff filters, product/unit filters, payment filters, sync filters, conflict filters, CSV exports, and print/PDF-friendly output.
- Current analytics work should be retained where it provides real production reads, then refactored into the standard table, chart, and filter patterns rather than discarded.
- Charts and metric cards should explain operational state clearly. They should not introduce decorative analytics that cannot be traced to a defined query or metric.
- Sync history and conflict review should remain behind manager-capable permissions and should surface business impact plus review actions.
- Subscription surfaces should be operational: current plan, tier definitions, usage, limits, and upgrade handoff. They should not become a marketing page.
- Payroll or payout should be included in the information architecture as planned space, but first implementation can keep it as a placeholder or planning route unless the product scope is narrowed later.
- Locale/i18n should be investigated against Midday before route structure is finalized. If locale is deferred for the first slice, the decision should be explicit and leave a low-friction path to add it later.
- Desktop wrapping should follow the Midday desktop approach. The desktop app should wrap the dashboard rather than reimplementing workflows.
- Desktop planning should decide app name, environment URLs, auth handoff, icons, branding, app ids, platform targets, build profiles, and internal versus public release requirements before implementation.
- Implementation should be phased. Recommended phases are discovery/audit, architecture blueprint, shell and auth alignment, route and navigation foundation, table/form/sheet/modal primitives, core domain pages, analytics/search, desktop wrapper, and final QA hardening.
- Every meaningful implementation phase should update Brain docs when architecture, API, data contracts, feature behavior, or task status changes.

## Testing Decisions

- Tests should verify external user-facing behavior and domain outcomes, not internal component structure.
- The primary testing seam is browser-driven dashboard workflow QA through the real dashboard experience using the local dashboard/API stack.
- Browser workflow QA should cover login/signup, onboarding, business/store switching, sidebar navigation, products/catalog, inventory/inbounds, staff, sales/customers, analytics/reports, search-anything, sheets/modals/forms, and role-based visibility.
- The primary local development command for website/dashboard QA should use the repository's profile-aware dev command with dashboard and marketing filters where those surfaces are in scope.
- Browser QA should use the repository's Portless hostnames rather than raw localhost ports except for low-level Portless debugging.
- Supporting tRPC/API contract tests should be added where browser tests cannot cleanly prove domain behavior, permission boundaries, tenant scoping, mutation outcomes, or idempotency.
- Contract tests should cover auth/session context, tenant/store selection, role-based access, product creation, stock intake, unit conversion, sale reads, customer book reads, staff invite/status changes, generated-link management, subscription reads, sync history, and conflict acknowledgement where those workflows are touched.
- Low-stock alert tests should cover threshold calculation, reserved-stock-aware available quantity, duplicate prevention, acknowledgement, snooze, automatic resolution after restock, permission gates, dashboard count consistency, inventory filters, and notification-setting visibility.
- Dashboard table tests should focus on user-observable behavior: rendering rows, applying filters, sorting, pagination or virtualization, selection, row actions, skeletons, empty states, and exports.
- Form tests should verify validation, submission, loading state, success state, error state, and cache invalidation outcomes rather than internal field implementation.
- Sheet and modal tests should verify open/close behavior, submitted outcomes, destructive confirmations, and preservation of page context.
- Search tests should verify keyboard/open entry, result grouping, record navigation, command actions, permission filtering, empty state, loading state, and error state.
- Analytics tests should verify metric definitions, date and store filters, table values, export data, and print/PDF-friendly layout behavior where possible.
- Role tests should verify that owner/admin, manager, and attendant users see only the correct navigation and can call only permitted API workflows.
- Multi-business tests should verify switching businesses and stores changes query context and never leaks data across tenant boundaries.
- Performance QA should include large product, customer, sales, and inventory datasets to prove table pagination, virtualization, and rendering remain usable.
- Responsive QA should include common laptop and desktop viewport widths, plus a narrower web viewport to catch layout collapse.
- Accessibility QA should check keyboard navigation, focus management in sheets/modals/search, visible focus states, contrast, semantic labels for icon buttons, and status text that is not color-only.
- Desktop-wrapper testing should begin with one smoke/build seam once the desktop phase starts. It should prove the wrapper launches, points to the intended environment, preserves auth expectations, uses EwaTrade branding, and can package an internal build.
- Prior art should come from existing Retail Ops API/query tests, dashboard reporting behavior, Midday dashboard patterns, HalalVest dashboard patterns, and the existing web QA command conventions in Brain.
- No production-profile DB commands should be part of ordinary dashboard QA unless explicitly requested and the target database is confirmed.

## Out of Scope

- Implementing the dashboard in this spec-writing pass.
- Replacing the mobile app or changing mobile Retail Ops workflow behavior.
- Creating a dashboard-only data model that diverges from Retail Ops.
- Replacing Prisma as the schema source of truth.
- Introducing Supabase or direct client database access.
- Creating final payroll, payout, tax, or provider settlement behavior unless a later dashboard ticket narrows that scope.
- Choosing final subscription pricing, billing provider details, or app-store purchase behavior.
- Building a full customer marketplace, full customer app, or broad dispatch marketplace as part of dashboard standardization.
- Implementing advanced desktop distribution, signing, notarization, auto-update, or public release flows before the desktop wrapper strategy ticket decides them.
- Adding database schema changes or migrations before implementation tickets identify concrete API/data needs.
- Manually creating Prisma migration files.
- Server-generated PDF infrastructure unless a later reporting ticket chooses it. Browser print/PDF-friendly reports are enough for the first dashboard standard.
- Rebuilding every HalalVest dashboard page directly. HalalVest is a reference and possible source for ports, not the final architecture standard.
- Copying Midday product features that do not map to EwaTrade's merchant operations, Retail Ops, or dashboard needs.

## Further Notes

- The dashboard Wayfinder remains useful as the decision trail. This spec is the ready-for-agent PRD for implementation planning and execution.
- The next recommended work item is the cross-codebase dashboard audit, because it supplies the factual basis for the HalalVest copy/port boundary and Midday compliance blueprint.
- Auth should specifically study HalalVest first, then adapt it to EwaTrade's current tenant, store, session, membership, and Better Auth direction.
- The dashboard should feel dense, operational, and work-focused. It should not become a marketing page, decorative landing page, or mobile UI stretched onto desktop.
- Every implementation handoff should state whether Brain docs, API docs, database docs, or ADRs need updating.
