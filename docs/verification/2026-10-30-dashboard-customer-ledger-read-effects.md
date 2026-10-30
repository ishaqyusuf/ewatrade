# Dashboard Customer Ledger completion read effects —30 October2026

DP-203/404/405/501 source slice under the [full27-ticket program](../plans/2026-10-29-dashboard-performance-program.md).
Parent `1d11b9396`; seven owned source/test/impact inputs and lock frozen for local
smoke. Program remains **4/27 (14.8%)**, all59 routes/nine families; no new ticket
or separate Finance-roadmap acceptance. No deployment or business submission.

## Reproduction and correction

The actual `useCustomerLedgerCommand` invalidated five namespaces after both
successful commands and recovery acknowledgement. Real mounted hook/runner tests
hold loaded fixed statement reads: success and committed/rejected acknowledgement
remain unfinished until those unrelated snapshot reloads complete. The old code
also refreshes contact directories/count and Service settings/assignees, although
the ledger commands do not alter those contacts/configuration. The reproduction
has three failures and three passing guard/refusal cases before product changes.

A small application helper now owns the same completion effects at that existing
hook seam. The hook is otherwise identical: write callbacks, pending/saved/error/
notice transitions, salted metadata-only identity, exact retry, acknowledgement,
lock and online/session gates are unchanged. Native command runner, lock helper,
statement component and actual workspace admission boundary are unchanged.

| Cached read | Completion and acknowledgement behavior |
| --- | --- |
| Loaded successful fixed Customer statement and continuation entries/totals | Retain existing snapshot; do not reread to finish the command |
| Loaded known fixed Finance account statements/ledger | Reuse existing Finance snapshot rule |
| Latest, failed, pending, absent, malformed or unrecognized statement keys | Keep refresh behavior |
| Current Customer accounts/detail, sources, refunds and other mutable Ledger reads | Refresh; live detail still owns command revision/available funds |
| Mutable Finance and Orders | Keep existing namespace refresh; further narrowing requires separate evidence |
| Customer detail with Order history | Refresh its procedure prefix |
| Service job detail, ordinary/infinite queues and stage counts | Refresh through existing explicit list helper plus job detail |
| Pure contact directory/count and Service settings/assignees | Unchanged |

Only existing cached queries are invalidated; no uncached dependency is started.
Ordinary/infinite variants retain their typed SDK identities. No stale/gc TTL,
query input, snapshot selection, scope or server admission change. Canonical fixed
sequence syntax and signed64-bit bounds include0; current Finance report/journal
metadata remains refreshable. Unknown/prefixed layouts tested retain refresh.

The Customer statement DTO is **not wholly immutable**: `currentRevision` is
informational current metadata. Entries/totals, allocations/releases and paging
are bounded by the chosen sequence. Actual statement UI gets revision, available
credit and refund holds from separate live `accountDetail`; command actions never
use the statement's informational revision. Current Customer-account root admission
still refreshes, and a fresh error hides retained statement children. These rules
preserve protected viewing and current command authority; cache classification
cannot authorize a receipt, refund, allocation or financial correction.

Midday reference: actual Customer form's explicit directory/detail/search effects
and thin orchestration. EwaTrade's native snapshot/refund/lock authority determines
which readers may be retained. No new cache framework or optimistic money write.

## Verification and limitations

- Actual hook, command runner, lock helper and typed tRPC cache/observers run with
  isolated in-memory browser storage/locks and inert query/write ports. Only
  recovery/root query paths are permitted by the fake transport; API commands
  throw. Final Customer fixture **6 cases/82 assertions** passes: success,
  committed/rejected acknowledgement without a second write, offline/lock refusal
  and actual workspace refusal hiding retained children. Latest and failed pinned
  statements refresh while held successful snapshots and unrelated data remain.
- Existing Finance completion wrapper, SDK classifier and unchanged Customer
  command-runner regressions pass together: **15 outer cases/105 assertions**.
  This includes two child-fixture wrappers; child counts are not independent
  aggregate tests. Classifier covers0/max/paged, malformed/latest, error/pending/
  absent, private-live/other-domain and unknown layouts. Numeric cache markers are
  not financial DTOs, monetary correctness or real server latency evidence.
- Full Dashboard and new fixture graphs typecheck. Initial fixture setup needed a
  navigator userAgent and a typed tRPC refusal; these harness corrections introduce
  no product change or type assertion. Owned seven-path quick selection passes
  **237/1533 across45 files**, QA tooling types and Biome, zero unknown mappings;
  foreign Agent Chat and staged explainers are excluded. Final refusal-port cleanup
  has separate fixture runtime/type/format proof. Reviewed H02 passes one client
  impact record, zero API/capability deltas; H01 unchanged evidence is reused.
- Hook source parity excludes only the invalidation import/body; four unchanged
  command/admission/statement owners match HEAD. No API/database/schema, command,
  transaction, permissions, financial payload, dependency or provider change.
- SQL-free local API/Dashboard doctor and QA availability200 pass. First canonical
  attempt fails before any check and leaves an empty artifact directory; its
  receipt is retained and cause unconfirmed. Canonical runner retried with normal
  Chromium process access passes **14:40:04.699Z–14:40:27.782Z**: existing QA login,
  Catalog, draft item/total and Cancel. All frozen seven inputs and lock still match.
  Business API mutations are intercepted; no receipt/refund/payment or fixture is
  submitted. Inert completion proof is not acceptance of live financial commands.

No service switch/restart or deployment. Existing Dashboard development mode and
other services stay running. `runtimeVerified:false`; the earlier abf8aae83/KRKy
optimized timings predate this slice. No new refresh/warm sample, p95, aggregate
budget, family-wide or release acceptance is claimed.

Private `/tmp/ewatrade-dashboard-program-20261029/customer-ledger-refresh-*` retains
red/green/focused/type/quick/H02/doctor logs, parity, hashes, availability and failed/
passed receipts. Brain current checkpoints and Customer-ledger behavior updated
locally. No API/schema/ADR update is required for this application-cache-only change.

All23 open program tickets remain open. Next inspect actual Order-change completion
in `components/orders/overview/use-order-refresh.ts`, its awaited and deferred
invalidation owners and snapshot/live dependencies before changing that ordering.
Remaining lifetime, background work, family rollout and optimized budgets retain
all original criteria. This source slice does not satisfy full DP-203.
