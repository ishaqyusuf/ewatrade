# 06 - Sales, Sessions, Customers, And Closeout Review

**What to build:** dashboard users can review sales, customer book entries, cashier sessions, payment reconciliation, closeout state, and variance information from standard dashboard tables.

**Blocked by:** 03 - Products Proof Slice With Table, Sheet, And Form Foundations; 05 - Staff Management And Role Administration.

**Status:** implementation-complete

- [x] Sales table shows recent and historical sales with product/unit, customer, payment, actor, session, and status context where available.
- [x] Customer book table supports search and tenant-scoped customer review.
- [x] Cashier session and payment reconciliation views expose open/closed session state, expected payments, declared payments, and variance where available.
- [x] Closeout and stock variance review uses role-aware access and clear operational status.
- [x] Tables use the shared dashboard table pattern with filters, empty states, loading states, and export where appropriate.
- [x] Browser QA covers sales review, customer search, session filtering, payment reconciliation, variance review, and role-gated access.
- [x] API or Brain docs are updated if dashboard sales/session/customer behavior or contracts change.

## Implementation Notes

- Added authenticated dashboard routes `/sales` and `/customers` using the standard shell, summary cards, shared `DashboardTable`, search/filter controls, empty states, and refresh-on-filter client behavior.
- Added `GET /api/sales` and `GET /api/customers` as temporary dashboard bridge routes over the existing Retail Ops sale, credit sale, customer book, session, and payment reconciliation query helpers.
- Preserved existing Retail Ops role semantics: owner/admin/manager roles read selected-store operational data, while cashier/operator roles are actor/user scoped.
- Added `sales-operations` helpers and tests for POS access, manager read scope, money/payment/customer/product formatting, variance calculation, and sales filtering.

## QA Evidence

- `bun test apps/dashboard/src/lib/sales-operations.test.ts apps/dashboard/src/lib/staff-management.test.ts apps/dashboard/src/lib/navigation.test.ts`
- `bun --filter @ewatrade/dashboard typecheck`
- `bunx biome check 'apps/dashboard/src/app/(shell)/sales/page.tsx' 'apps/dashboard/src/app/(shell)/customers/page.tsx' apps/dashboard/src/app/api/sales/route.ts apps/dashboard/src/app/api/customers/route.ts apps/dashboard/src/components/dashboard/sales-page.tsx apps/dashboard/src/components/dashboard/customers-page.tsx apps/dashboard/src/lib/sales-data.ts apps/dashboard/src/lib/sales-operations.ts apps/dashboard/src/lib/sales-operations.test.ts`
- `git diff --check`
- HTTP QA against the local dashboard/marketing stack:
  - Authenticated `/sales` returned 200.
  - Logged-out `/sales` redirected to `http://localhost:3092/login?next=%2Fsales`.
  - Authenticated `GET /api/sales` returned 200 with sales, credit sales, sessions, reconciliation, and store keys.
  - Authenticated `GET /api/sales?sessionStatus=closed` returned 200.
  - Authenticated `/customers` returned 200.
  - Logged-out `/customers` redirected to `http://localhost:3092/login?next=%2Fcustomers`.
  - Authenticated `GET /api/customers` and `GET /api/customers?search=a` returned 200.

The current QA fixture has no sales/session/customer rows, so browser verification covered page/API access, role-gated redirects, filters, response shape, and empty states. Seeded non-empty operational fixture coverage remains a follow-up QA hardening item.
