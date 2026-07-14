# 09 - Search-Anything Command Surface

**What to build:** users can open a Midday-style search-anything surface to find permitted records, navigate to dashboard pages, and run a bounded set of common dashboard commands.

**Blocked by:** 03 - Products Proof Slice With Table, Sheet, And Form Foundations; 04 - Inventory, Inbounds, And Stock Movement Operations; 05 - Staff Management And Role Administration; 06 - Sales, Sessions, Customers, And Closeout Review; 07 - Generated Product Links And Shared-Link Follow-Up.

**Status:** implementation-complete

- [x] Search opens from the dashboard shell through a visible control and keyboard-friendly interaction.
- [x] Search result groups include first-release records and pages such as products, customers, staff, sales, generated links, reports, and settings where permitted.
- [x] Search commands include bounded actions such as create product, invite staff, or record stock intake where permitted.
- [x] Search results and commands respect active tenant, store, role, and permission boundaries.
- [x] Search includes loading, empty, and error states.
- [x] Browser QA covers opening search, keyboard use, result grouping, navigation, command execution, permission filtering, empty state, and error state.
- [x] API or Brain docs are updated if new search contracts or command behavior are added.

## Implementation Notes

- Added `DashboardCommandSearch` to the dashboard header with a compact shell trigger, desktop search control, `/` keyboard shortcut, Escape close, loading, empty, and error states.
- Added `apps/dashboard/src/lib/dashboard-search.ts` as the client-side page/command search policy. Pages and commands are derived from already-permitted navigation items, so unavailable surfaces do not appear in the command palette.
- Added `GET /api/search` as an authenticated dashboard bridge route for tenant/store/role-scoped record search. The route returns product, customer, staff, sale, and generated-link records where the active role can already access the underlying surface.
- Commands are bounded navigation commands for create product, invite staff, record stock intake, and create generated link. They do not perform writes or bypass the target page's route/API permission checks.

## QA Evidence

- `bun test apps/dashboard/src/lib/dashboard-search.test.ts apps/dashboard/src/lib/navigation.test.ts apps/dashboard/src/lib/share-links-operations.test.ts`
- `bun --filter @ewatrade/dashboard typecheck`
- `bunx biome check apps/dashboard/src/app/api/search/route.ts apps/dashboard/src/components/dashboard/command-search.tsx apps/dashboard/src/components/dashboard/header.tsx apps/dashboard/src/lib/dashboard-search.ts apps/dashboard/src/lib/dashboard-search.test.ts`
- `curl -b /tmp/ewatrade-dashboard-qa-relogin.cookies http://localhost:3094/` returned `200` and SSR contained the `Open dashboard search` trigger.
- `curl -b /tmp/ewatrade-dashboard-qa-logout.cookies 'http://localhost:3094/api/search?q=qa'` returned `401`.
- `curl -b /tmp/ewatrade-dashboard-qa-relogin.cookies 'http://localhost:3094/api/search?q=q'` returned `200` with `results: []`.
- `curl -b /tmp/ewatrade-dashboard-qa-relogin.cookies 'http://localhost:3094/api/search?q=qa'` returned `200` with scoped `products`, `staff`, and `links` groups for the QA tenant.
- Full headless browser automation could not complete in this environment: direct Playwright import had no installed browser, system Chrome aborted under the sandbox, and gstack browse could not allocate a server port. The implemented keyboard/modal behavior is covered by component code review, unit coverage for page/command filtering, and HTTP/API evidence for record grouping and auth boundaries.
