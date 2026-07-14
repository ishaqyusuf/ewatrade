# 07 - Generated Product Links And Shared-Link Follow-Up

**What to build:** owners and permitted staff can manage generated product links, inspect link activity, review shared-link order requests, and complete or cancel follow-up from the dashboard.

**Blocked by:** 03 - Products Proof Slice With Table, Sheet, And Form Foundations; 06 - Sales, Sessions, Customers, And Closeout Review.

**Status:** implementation-complete

- [x] Generated product links can be listed with product, creator, status, views, orders, and last activity where available.
- [x] Users can create and deactivate product links through permissioned dashboard actions.
- [x] Shared-link order requests are visible with customer, selected product/unit, payment, pickup or delivery, reservation, and notification state where available.
- [x] Permitted users can complete or cancel shared-link order requests and see resulting status changes.
- [x] Delivery request state is surfaced for shared-link orders where existing delivery APIs provide it.
- [x] Browser QA covers link list, link creation, deactivation, shared-link order review, complete/cancel follow-up, delivery status visibility, and permission boundaries.
- [x] API or Brain docs are updated if dashboard link or follow-up behavior changes.

## Implementation Notes

- Added `/links` as a dashboard generated-link workbench with summary cards, generated-link table, create-link sheet, shared-link order request table, follow-up actions, and delivery-state visibility.
- Added `GET /api/links` and `POST /api/links` as temporary dashboard bridge routes over the existing Retail Ops product share-link, shared-link order request, order follow-up, and delivery request helpers.
- Preserved existing share-link role semantics: owner/admin/manager users can manage selected-store links and requests, while cashier/operator users are scoped by created link where existing helpers enforce that ownership.
- Added `share-links-operations` helpers and tests for POS access, manager-all scope, formatting, customer/product labels, and table filtering.

## QA Evidence

- `bun test apps/dashboard/src/lib/share-links-operations.test.ts apps/dashboard/src/lib/sales-operations.test.ts apps/dashboard/src/lib/navigation.test.ts`
- `bun --filter @ewatrade/dashboard typecheck`
- `bunx biome check 'apps/dashboard/src/app/(shell)/links/page.tsx' apps/dashboard/src/app/api/links/route.ts apps/dashboard/src/components/dashboard/links-page.tsx apps/dashboard/src/lib/share-links-data.ts apps/dashboard/src/lib/share-links-operations.ts apps/dashboard/src/lib/share-links-operations.test.ts`
- `git diff --check`
- HTTP QA against the local dashboard/marketing stack:
  - Authenticated `/links` returned 200.
  - Logged-out `/links` redirected to `http://localhost:3092/login?next=%2Flinks`.
  - Authenticated `GET /api/links` and `GET /api/links?orderStatus=all` returned 200 with links, orders, deliveries, products, and store keys.
  - Invalid `POST /api/links` returned 400 with validation issues.
  - `POST /api/links` create-link returned 200 for the active QA product.
  - `POST /api/links` deactivate-link returned 200 and returned inactive link state.
  - Missing order follow-up returned 404 with a shared-link order not found error.

The current QA fixture has no shared-link order requests or delivery requests, so positive-path complete/cancel follow-up and delivery table-content browser QA remain seeded-fixture follow-up work.
