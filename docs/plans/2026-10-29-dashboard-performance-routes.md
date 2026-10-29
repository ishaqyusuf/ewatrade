# Dashboard route performance inventory

29 October2026 working-tree source inventory. All page entrypoints are mapped;
this is not a claim that every page has been timed or is slow. New source can be
concurrent/unaccepted. Public links, redirects, staff/platform and authenticated
routes retain their own permission/identity boundaries.

[Program](2026-10-29-dashboard-performance-program.md).

| Route | Owning ticket | Entry source |
| --- | --- | --- |
| `/activity` | DP-407 | `apps/dashboard/src/app/(shell)/activity/page.tsx` |
| `/analytics` | DP-409 | `apps/dashboard/src/app/(shell)/analytics/page.tsx` |
| `/assistant/c/[id]` | DP-407 | `apps/dashboard/src/app/(shell)/assistant/c/[id]/page.tsx` |
| `/assistant` | DP-407 | `apps/dashboard/src/app/(shell)/assistant/page.tsx` |
| `/catalog` | DP-402 | `apps/dashboard/src/app/(shell)/catalog/page.tsx` |
| `/conversations` | DP-406 | `apps/dashboard/src/app/(shell)/conversations/page.tsx` |
| `/customer-ledger` | DP-404 | `apps/dashboard/src/app/(shell)/customer-ledger/page.tsx` |
| `/customers/[customerId]/statement` | DP-404 | `apps/dashboard/src/app/(shell)/customers/[customerId]/statement/page.tsx` |
| `/customers` | DP-404 | `apps/dashboard/src/app/(shell)/customers/page.tsx` |
| `/finance/accounts` | DP-405 | `apps/dashboard/src/app/(shell)/finance/accounts/page.tsx` |
| `/finance/bank` | DP-405 | `apps/dashboard/src/app/(shell)/finance/bank/page.tsx` |
| `/finance` | DP-405 | `apps/dashboard/src/app/(shell)/finance/page.tsx` |
| `/finance/payments` | DP-405 | `apps/dashboard/src/app/(shell)/finance/payments/page.tsx` |
| `/finance/refunds` | DP-405 | `apps/dashboard/src/app/(shell)/finance/refunds/page.tsx` |
| `/finance/reports` | DP-409 | `apps/dashboard/src/app/(shell)/finance/reports/page.tsx` |
| `/finance/spending` | DP-405 | `apps/dashboard/src/app/(shell)/finance/spending/page.tsx` |
| `/finance/suppliers` | DP-405 | `apps/dashboard/src/app/(shell)/finance/suppliers/page.tsx` |
| `/inventory/operations` | DP-402 | `apps/dashboard/src/app/(shell)/inventory/operations/page.tsx` |
| `/inventory` | DP-402 | `apps/dashboard/src/app/(shell)/inventory/page.tsx` |
| `/inventory/transfers` | DP-402 | `apps/dashboard/src/app/(shell)/inventory/transfers/page.tsx` |
| `/` | DP-401 | `apps/dashboard/src/app/(shell)/page.tsx` |
| `/platform/qa-maintenance` | DP-408 | `apps/dashboard/src/app/(shell)/platform/qa-maintenance/page.tsx` |
| `/prescriptions` | DP-406 | `apps/dashboard/src/app/(shell)/prescriptions/page.tsx` |
| `/prescriptions/reports` | DP-409 | `apps/dashboard/src/app/(shell)/prescriptions/reports/page.tsx` |
| `/products` | DP-402 | `apps/dashboard/src/app/(shell)/products/page.tsx` |
| `/sales/orders/[orderId]` | DP-403 | `apps/dashboard/src/app/(shell)/sales/orders/[orderId]/page.tsx` |
| `/sales` | DP-403 | `apps/dashboard/src/app/(shell)/sales/page.tsx` |
| `/service-commerce/reports` | DP-409 | `apps/dashboard/src/app/(shell)/service-commerce/reports/page.tsx` |
| `/services` | DP-406 | `apps/dashboard/src/app/(shell)/services/page.tsx` |
| `/services/requests` | DP-406 | `apps/dashboard/src/app/(shell)/services/requests/page.tsx` |
| `/settings/billing` | DP-408 | `apps/dashboard/src/app/(shell)/settings/billing/page.tsx` |
| `/settings/channels` | DP-408 | `apps/dashboard/src/app/(shell)/settings/channels/page.tsx` |
| `/settings/compliance` | DP-408 | `apps/dashboard/src/app/(shell)/settings/compliance/page.tsx` |
| `/settings/domains` | DP-408 | `apps/dashboard/src/app/(shell)/settings/domains/page.tsx` |
| `/settings/notifications` | DP-408 | `apps/dashboard/src/app/(shell)/settings/notifications/page.tsx` |
| `/settings` | DP-408 | `apps/dashboard/src/app/(shell)/settings/page.tsx` |
| `/settings/prescriptions` | DP-408 | `apps/dashboard/src/app/(shell)/settings/prescriptions/page.tsx` |
| `/settings/receipts` | DP-408 | `apps/dashboard/src/app/(shell)/settings/receipts/page.tsx` |
| `/settings/returns` | DP-408 | `apps/dashboard/src/app/(shell)/settings/returns/page.tsx` |
| `/settings/service-commerce` | DP-408 | `apps/dashboard/src/app/(shell)/settings/service-commerce/page.tsx` |
| `/settings/stores` | DP-408 | `apps/dashboard/src/app/(shell)/settings/stores/page.tsx` |
| `/settings/whatsapp-messages` | DP-408 | `apps/dashboard/src/app/(shell)/settings/whatsapp-messages/page.tsx` |
| `/staff` | DP-407 | `apps/dashboard/src/app/(shell)/staff/page.tsx` |
| `/website-requests` | DP-406 | `apps/dashboard/src/app/(shell)/website-requests/page.tsx` |
| `/storefront` | DP-408 | `apps/dashboard/src/app/(studio)/storefront/page.tsx` |
| `/storefront/updates/[tenantId]/[templateKey]/[version]` | DP-408 | `apps/dashboard/src/app/(studio)/storefront/updates/[tenantId]/[templateKey]/[version]/page.tsx` |
| `/access-unavailable` | DP-408 | `apps/dashboard/src/app/access-unavailable/page.tsx` |
| `/account/assistant-data` | DP-408 | `apps/dashboard/src/app/account/assistant-data/page.tsx` |
| `/account/whatsapp` | DP-408 | `apps/dashboard/src/app/account/whatsapp/page.tsx` |
| `/assistant-review` | DP-407 | `apps/dashboard/src/app/assistant-review/page.tsx` |
| `/login` | DP-408 | `apps/dashboard/src/app/login/page.tsx` |
| `/p/[code]` | DP-408 | `apps/dashboard/src/app/p/[code]/page.tsx` |
| `/pay/[token]` | DP-408 | `apps/dashboard/src/app/pay/[token]/page.tsx` |
| `/r/[handle]` | DP-408 | `apps/dashboard/src/app/r/[handle]/page.tsx` |
| `/setup` | DP-408 | `apps/dashboard/src/app/setup/page.tsx` |
| `/signup/chat` | DP-408 | `apps/dashboard/src/app/signup/chat/page.tsx` |
| `/signup` | DP-408 | `apps/dashboard/src/app/signup/page.tsx` |
| `/staff-onboarding` | DP-408 | `apps/dashboard/src/app/staff-onboarding/page.tsx` |
| `/storefront-preview` | DP-408 | `apps/dashboard/src/app/storefront-preview/page.tsx` |

Inventory: 59 page entrypoints.

## Required journey cases

| Family | Representative existing-data entry | Cases and boundaries |
| --- | --- | --- |
| DP-401 | `/` | Refresh, return from Catalog; summary ready versus shell ready; scope switch |
| DP-402 | `/catalog`, `/inventory` | Existing selected item, detail tabs, close/reopen, filters/Back, retained selection |
| DP-403 | `/sales` | Existing order read/timeline, draft open/cancel only, filters/Back; no submit |
| DP-404 | `/customers`, `/customer-ledger` | Directory search/Back and existing customer/account history; scoped balance visibility |
| DP-405 | `/finance`, `/finance/bank` | Existing book/account views; payments/refunds read-only and confirmation/freshness source checks |
| DP-406 | `/conversations`, `/website-requests`, `/services` | Existing queues/work detail, empty state if no eligible data, required polling and permission boundaries |
| DP-407 | `/assistant`, `/activity`, `/staff` | Open/minimize/history/search only; no model prompt, invitation or command submission |
| DP-408 | `/storefront`, `/settings`, `/login` | Existing Studio read/open/cancel, settings view, existing QA sign-in; setup/platform permissions separately |
| DP-409 | `/analytics`, `/finance/reports` | Existing report period, filter/return, bounded chart/table data; exports only if an existing safe read path |

Dynamic public payment/receipt/review pages require an already eligible existing
link, never a guessed token or manufactured fixture. Where such a link is absent,
record the evidence gap and cover route/proof/privacy source behavior; do not claim
live capability-page performance acceptance. Setup/redirect/platform routes likewise
retain their actual access requirement. DP-501/503 must inspect these gaps before
program completion. No public-capability or permission check is waived by this map.

For each route family, select an existing-data representative and capture refresh,
first and warm soft navigation, Back/filter restoration, detail close/reopen/tab
revisit, and an applicable failure/scope boundary. Existing aliases/redirects need
route correctness rather than an invented data benchmark. Public capability pages
require privacy/proof checks and no cross-link prefetch. Money and access changes
retain their existing focused domain proof; performance QA never submits business
commands or creates fixtures to manufacture a passing result.

Measurements: action-to-useful-content and feedback, loading reset, request/SQL
counts and durations, data volume, browser execution and compilation context.
Record actual candidates and repeat only on relevant changes or concrete failure.
No runtime/baseline acceptance is claimed by this source inventory alone.
