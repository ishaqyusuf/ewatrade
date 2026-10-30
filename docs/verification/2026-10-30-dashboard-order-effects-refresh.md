# Dashboard Order creation read effects —30 October2026

DP-203/403/405/406/501 slice under the [full27-ticket program](../plans/2026-10-29-dashboard-performance-program.md).
Parent `ea8b9ff33`, frozen six owned source/test/impact paths and lock. Program
remains **4/27 (14.8%)**; all23 open requirements retained. Local current checkout.

## Cause and dependency contract

Service intake's native composition can create a saved Customer, a Commercial
Order with debt, an initial collection and tracked work. Ordinary Order creation
can also create a Customer, initial payment, fulfilled stock and tracked Service
work. The canonical compositions remain in `service-work`, `service-intake-customer`
and `commercial-orders`/`commercial-payments`, with their existing financial/Order
locks and fresh server admission. No domain or API code changes in this slice.

The two Dashboard success callbacks refreshed order/stock/usage or job lists, but
omitted related current Finance/Customer-ledger projections and Customer history.
A retained fresh cache could keep earlier debt/balance/history after the command.
A route refresh on Sales/Services does not itself invalidate those client keys.
Actual mounted form callbacks reproduce zero balance/owed/account observer
refreshes before correction. This is a client cache-dependency defect, not evidence
that the native command calculates or records incorrect money.

An application helper now owns19 specific procedure prefixes shared by both forms.
It reuses the existing tRPC/QueryClient invalidation pattern; no new cache layer.

| Native effect | Read treatment |
| --- | --- |
| Customer creation/Order history | Current Customer detail refreshes if active; directory/count/search keys become stale for next use. |
| New debt or collection | Current balances, owed totals, Customer-balance directory/accounts/receivables and Customer-account detail refresh active cached observers. |
| Financial report/reconciliation effects | Current reports, close checklist and inventory reconciliation refresh if cached/active. |
| Sales/Service operational facts | Operational/sales and Service summary/report/drilldown keys become stale for next use. |
| Tracked Service work | Existing Service queue/paginated queue/stage-count helper also runs after ordinary Order creation; intake keeps its existing call. |
| Pinned statement/export identity | Account activity, account-ledger and Customer statement snapshots remain outside this mutable effect set. |

Uncached reads are never started by invalidation. Suppliers, expense/bill lists and
Book metadata remain outside the effect set. Customer/search lookups do not refetch
while a form closes. Ordinary creation keeps its existing `refetchType:none` Order
directory plus RSC reload; Service intake keeps its existing active Order refresh.
The duplicate Customer-directory invalidation in ordinary creation is replaced by
the helper's single deferred owner. No blanket Finance/ledger/global invalidation.
Midday Customer form's explicit affected-query invalidation informs this pattern;
existing EwaTrade private read, snapshot and command rules remain authoritative.

## Executed checks

- Both actual forms mount with real React, QueryClient and typed tRPC keys/options;
  their production success callbacks are captured without submitting mutations.
  Two new cases fail before the fix because live financial observers never refresh.
- After correction, five existing active cache observers (balances, owed, Customer
  account, Service queue and counts) refresh exactly once per callback. A numeric
  marker changes1→2. These are inert query functions, not financial DTOs, live API
  latency or native monetary correctness proof. Typed key matching uses actual
  procedure keys, including filtered/infinite consumers covered by prior tests.
- Active Customer/search lookup markers remain1 without eager fetch. Ordinary
  creation's active Order directory also waits for its existing RSC owner. Current
  retained projection variants become stale without fetching; unrelated Book,
  supplier/bill data and three fixed statement/ledger snapshots remain untouched.
  Route refresh remains once, and the transport permits only inert queries.
- Final focused result **8 cases/152 assertions** including prior Service read/
  infinite-list and Service job-list coverage. Isolated wrapper passes. Final full
  Dashboard and fixture type graphs pass; an initial test input incorrectly added
  a Book ID to the multi-currency Customer directory and was corrected.
- Scoped six-path quick check **237/1533** plus QA tooling types/Biome passes, zero
  unknown mappings; unrelated Agent Chat/staged explainers excluded. H01 unchanged
  API/capability proof reused; reviewed H02 passes one client record, zero capability
  or procedure deltas. No dependencies added.
- Component emitted-code parity holds after excluding success handlers: OrderForm
  excludes one, ServiceIntakeForm two. Source diff confines behavior changes to the
  two creation refresh handlers. Submission payloads, validation, pricing/money,
  draft/default state, selection, message offer and existing close behavior remain.
  This parity is not native command execution or permission acceptance.

## Local UI and remaining work

Existing-service liveness and read-only QA availability pass. Canonical development
smoke passes **13:55:13.388Z–13:55:38.484Z** with exact frozen source/lock hashes:
existing QA login, populated Catalog, Order draft/item/total and Cancel. It submits
no Order, Service intake, payment or Customer creation. Actual success effects are
proven at the inert mounted callback/cache seam above, not by a live business write.

Dashboard49718, API48226, Storefront46668 and Marketing90981 remain unchanged.
No runtime switch/restart, provider action, business fixture or deployment.
`runtimeVerified:false`; no optimized speed, p95, budget or release qualification.
The earlier KRKy optimized artifact predates this source and is not requalified.

Private `/tmp/ewatrade-dashboard-program-20261029/order-effects-*` retains
red/green/wrapper/type/quick/H02 logs, input hashes, parity, passed receipt and
liveness evidence. Brain BRAIN/task/QA/navigation, Service Commerce and quick-order
checkpoints updated locally. No API/schema/permission or durable architecture
change requires additional docs, migrations or an ADR.

DP-203 remains open across other commands. Next inspect the existing shared
`useFinanceInvalidation` blanket Finance prefix at real form success callbacks,
including unnecessary snapshot work and omitted cross-domain dependencies. Source
presence alone is not a proven defect. Full-family loading/lifetime/access/behavior,
interaction and optimized performance budgets remain in their original tickets.
