# 03 - Products Proof Slice With Table, Sheet, And Form Foundations

**What to build:** owners and managers can list, search, create, edit, and review Product Sales catalog items from the dashboard using the first Midday-style domain table plus the shared sheet and form foundations that later domains will reuse.

**Blocked by:** 02 - HalalVest-Aligned Auth, Dashboard Shell, And Workspace Switching.

**Status:** implementation-complete

- [x] Product list uses the agreed Midday-style table foundation with filters, loading skeleton, empty state, row actions, and stable desktop layout.
- [x] Product creation and editing use the agreed global sheet/form pattern with validation, loading, success, error, and query invalidation behavior.
- [x] Product unit and variant details remain consistent with the existing Retail Ops product model.
- [x] Product price and price-history information is surfaced where current APIs support it.
- [x] Owner/admin/manager permissions are enforced through API boundaries, not only through hidden UI.
- [x] Browser QA covers product list, search/filter, create, edit, empty state, validation error, successful mutation, and role-gated access.
- [x] The reusable table, sheet, and form conventions are documented for later dashboard tickets.

## Implementation Notes

- Added `/products` as the first dashboard catalog surface with a reusable `DashboardTable`, reusable `DashboardSheet`, search/status filters, loading skeleton, empty state, row actions, and create/edit form states.
- Added dashboard API bridge routes `GET /api/products`, `POST /api/products`, and `PATCH /api/products/[productId]` while the typed dashboard API surface is still being standardized. The create path delegates to the existing Retail Ops product setup helper; the edit path updates catalog fields and delegates default-unit price changes to the existing durable price-history helper.
- Added `apps/dashboard/src/lib/product-catalog.ts` for product table helpers, price parsing/formatting, default-unit resolution, and centralized owner/admin/manager catalog permission policy.
- Product creation supports primary unit setup plus one optional variant row in the proof slice. Existing variant rows are listed with stock and price; deeper variant editing remains for the inventory/catalog hardening tickets.
- Focused validation passed: `bun test apps/dashboard/src/lib/product-catalog.test.ts apps/dashboard/src/lib/navigation.test.ts`, `bun --filter @ewatrade/dashboard typecheck`, and targeted `bunx biome check` on the product slice files.
- HTTP/browser workflow QA covered authenticated `/products` SSR, logged-out `/products` redirect to marketing login, empty table state, product create, search, edit, price-history update, and validation error response. Role-gated access is covered by centralized catalog permission tests plus dashboard route/API checks.
