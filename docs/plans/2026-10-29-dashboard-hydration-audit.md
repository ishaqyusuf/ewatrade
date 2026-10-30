# Dashboard hydration audit — 29 October 2026

Partial DP-102 source evidence for the [full program](2026-10-29-dashboard-performance-program.md).
This audit does not establish per-route runtime hydration acceptance.

## Method and scope

An AST scan identified 52 direct server query/infinite-query option calls in 22 owners.
Inputs and client consumers were compared using their shared URL/filter/sort helpers.
Endpoint-name matches alone are insufficient: actor/Tenant/Store, pagination, report
range, query type, custom key suffixes and activation all matter. The prescriptions
workspace-access option stored in a variable was checked separately; this scan is
not a general proof that every indirect prefetch in the repository is covered.

The request-local QueryClient serializes successful and pending queries; the browser
default freshness is 60 seconds, with explicit endpoint overrides. A matching key
can still refetch because its owner requests fresh data. That is a DP-201 policy
decision, not automatically a hydration defect. Server admission and fresh command
authority remain unchanged.

## Direct call inventory

| Server owner | Sites | Procedures |
|---|---:|---|
| `app/(shell)/analytics/page.tsx` | 5 | `orders.salesReport`, `orders.salesReport`, `inventory.reconciliationReport`, `inventory.balanceReport`, `serviceReporting.summary` |
| `app/(shell)/catalog/page.tsx` | 1 | `catalog.listItemsPage` |
| `app/(shell)/conversations/page.tsx` | 2 | `serviceCommerce.storeConversationQueue`, `serviceCommerce.storeConversationTimeline` |
| `app/(shell)/inventory/operations/page.tsx` | 1 | `inventory.operationHistory` |
| `app/(shell)/inventory/page.tsx` | 1 | `inventory.balanceReport` |
| `app/(shell)/inventory/transfers/page.tsx` | 1 | `inventory.transfers` |
| `app/(shell)/prescriptions/page.tsx` | 3 | `prescriptions.setup`, `prescriptions.queueContext`, `prescriptions.queue` |
| `app/(shell)/prescriptions/reports/page.tsx` | 1 | `prescriptions.report` |
| `app/(shell)/sales/orders/[orderId]/page.tsx` | 3 | `orders.get`, `orders.timeline`, `orders.changeOptions` |
| `app/(shell)/sales/page.tsx` | 2 | `catalog.listItems`, `orders.listPage` |
| `app/(shell)/service-commerce/reports/page.tsx` | 1 | `serviceCommerce.report` |
| `app/(shell)/services/page.tsx` | 4 | `catalog.listItems`, `services.queuePage`, `serviceAccess.requestForms`, `serviceAccess.requests` |
| `app/(shell)/settings/channels/page.tsx` | 5 | `serviceCommerce.channelWorkspace`, `serviceCommerce.pendingQuoteApprovals`, `serviceCommerce.storeConversationAvailabilitySettings`, `serviceCommerce.quoteReleaseSettings`, `serviceCommerce.storeConversationChannelModeSettings` |
| `app/(shell)/settings/compliance/page.tsx` | 7 | `prescriptions.setup`, `prescriptions.channelInfo`, `prescriptions.whatsappConnections`, `prescriptions.deliveryZones`, `prescriptions.retentionPolicy`, `prescriptions.manualDeliveryReviews`, `prescriptions.complianceEvents` |
| `app/(shell)/settings/domains/page.tsx` | 2 | `domains.list`, `domains.registrantProfile` |
| `app/(shell)/settings/receipts/page.tsx` | 1 | `orders.receiptSettings` |
| `app/(shell)/settings/returns/page.tsx` | 1 | `orders.changePolicy` |
| `app/(shell)/settings/service-commerce/page.tsx` | 4 | `serviceCommerce.workspaceAccess`, `catalog.listItems`, `serviceCommerce.bookingConfiguration`, `serviceAccess.requests` |
| `app/(shell)/settings/stores/page.tsx` | 1 | `tenant.stores` |
| `app/(shell)/settings/whatsapp-messages/page.tsx` | 1 | `customerMessages.templates.list` |
| `app/setup/page.tsx` | 1 | `tenant.ownerSignupSetup` |
| `components/finance/finance-route.tsx` | 4 | `finance.book`, `finance.bankStatements.list`, `finance.supplierDirectory`, `finance.bills` |

## Input and activation findings

- Catalog/Inventory detail: the scoped reader adds actor, Tenant, Store, permission,
  generation and visit identity. A raw `catalog.itemOverview` prefetch cannot serve
  that consumer. Catalog and Inventory unused prefetches have been removed; scoped
  key-isolation checks remain valid. Useful scoped detail hydration is still open.
- Catalog/Sales/Services directories use their corresponding shared filter and sort
  builders. Infinite reads must retain their infinite-query key and cursor semantics.
  These paths need runtime request-count evidence before DP-102 acceptance.
- Conversations resolves the requested Store against the same permitted Store list
  in both route and sheet. Timeline input is conversation ID, limit 50 and resolved
  Store; the global sheet does not silently fall back to a different active Store.
- Receipts resolves the selected Store, otherwise active Store, in route and form.
  Business-wide presentation still reads through the active Store. WhatsApp message
  templates use the same `templateListInput` and permitted-Store/business fallback.
- Channel settings resolves the permitted Store consistently. Awaiting every settings
  prefetch before rendering its Suspense boundary remains a DP-104 scheduling candidate.
- Analytics passes the parsed current range and `previousReportRange` to the same
  sales input shape consumed by the client. Reconciliation/balances retain Store
  and compatible-total inputs. The30October follow-up uses the same parsed tab:
  Service entry skips its two unmounted Stock queries (5→3 operations), while
  Stock/default/invalid entry keeps5. Service summary remains common for its warning
  indicator. Actual route/consumer/nuqs/tabs/tRPC/cache SSR proof confirms matching
  hydration and later activation; browser timing/Back and full DP-102/409 remain.
  [Receipt](../verification/2026-10-30-dashboard-report-prefetch.md).
- Service and prescription reports use the current parsed range/Store. Their separate
  previous-period client read is additional work, not a mismatch of the current key.
- Services originally prefetched manager request forms/requests on Work and the Work
  queue on Requests. The follow-up now uses the same typed URL parsers as the client:
  only the authorized selected table and open-sheet dependencies are prefetched.
  Actual route tests and existing-data views pass; full DP-406 acceptance remains.
- Finance book ID is a real dependency for the selected bank/supplier/spending list.
  Corresponding trimmed filters, sort and limit 30 match their client directories.
  Table/view settings and the book now start together after admission, verified by
  holding the settings reads pending at the actual route boundary. Unselected
  financial lists are still not prefetched. Full DP-405 runtime acceptance remains.
- Prescription access uses the explicit workspace-access result to decide which
  queue/setup reads are admitted. Preserve access-before-data ordering and exact Store
  scope. Do not parallelize protected data ahead of that decision.
- Setup, Store list, Domains, Returns and Order detail use the same literal inputs
  as their corresponding consumers in the inspected source. Their current proof and
  no-store rules remain separate from ordinary presentation retention.

## Remaining DP-102 acceptance

- Exercise representative initial and hydrated reads with request counts, including
  pagination, selected Store and deep-linked panels, on a pinned optimized local build.
- Prove no avoidable immediate duplicate fetch for useful prefetches; explicitly record
  fresh-read exceptions and out-of-scope hydration refusal.
- Reconcile indirect prefetch helpers and route changes since this dated inventory.
- Preserve separate DP-201/202 lifetime, DP-203 invalidation and DP-501 behavior proof.

No new broad cache TTL, access exemption, API contract or deployment is authorized
by this source audit.

## Render-owned streaming follow-up

Server transport now streams results inside a React.cache-owned render-request
batch. Actual transport/protected middleware6/40 proves a ready sibling resolves
while another is pending, pending hydration avoids another fetch, and concurrent
owners cannot share a batch. One fresh API admission per owner remains. This is
shared contract evidence, not per-route runtime acceptance.

DP-104 still includes awaited presentation reads in Channels, Compliance,
Service-commerce settings, Stores, Returns, Receipts, WhatsApp messages,
Conversations and Order detail. Channels additionally gates the workspace on all
five queries, so changing its route alone cannot isolate loaded sections. Clinical
workspace access before admitted prescription data is a genuine dependency. Keep
that ordering. [Evidence](../verification/2026-10-29-dashboard-server-streaming.md).

## Presentation route waits corrected

The nine awaited presentation owners listed above now start their same prefetches
without waiting to return the route. Actual functions22/64 pass after9 red cases,
including allowed Store/role/pharmacy checks and open booking dependencies. Setup
and clinical workspace-access waits remain. Channels' client all-query pending/error
gate, other section boundaries and per-family runtime acceptance stay open.
[Evidence](../verification/2026-10-29-dashboard-route-presentation.md).

## Channels section ownership corrected

The Channels client all-query gate is now removed. Workspace admission remains the
root owner; management sections mount only with current canManage, and optional
read pending/error/retry stays local. Approval scheduling still overlaps workspace.
Same Store query inputs and route prefetches remain; actual mounted16/109 plus
existing-data navigation/refresh/details dismissal pass. Other section gates and
per-family optimized identity/count proof remain open.
[Evidence](../verification/2026-10-29-dashboard-section-loading.md).
