# Dashboard query lifetime policy —29 October2026

Working DP-201/202/204 contract under the [full program](2026-10-29-dashboard-performance-program.md).
This preserves the existing authority model. Per-owner application and runtime
acceptance remain open; a pattern count is not proof of a defect.

## Inventory and limits

At965f64794, an AST inventory found425 direct tRPC query/infinite option calls in
245 production files. It resolves same-file option spreads and nearby useQuery
object overrides.279 inherit freshness;127 explicitly use0;9 Infinity;10 other
bounded/symbolic values.35 explicitly use zero retention and25 define polling.
Some sites are imperative/server reads. Manual queryFn hooks, imported spreads
and dynamic activation require inspection beyond this scan. The private inventory
is `query-lifetime-inventory.json` in the dated program evidence directory.

Existing browser default:60s freshness and TanStack5min inactive retention. Server
QueryClient is cached per render request, not shared across actors or requests.
Successful and pending reads hydrate. Browser scope/sign-out changes clear data
and increment the async generation. Rejected fresh reads with FORBIDDEN,
UNAUTHORIZED or NOT_FOUND erase the earlier payload. These rules do not replace
per-feature mount/visit/proof ownership or server command authority.

## Owner policy

| Read category | Freshness and retention | Activation and invalidation |
|---|---|---|
| Ordinary directories/reference | Existing60s/5min browser default; retain filters, sort, cursor and scope identity. Search categories may keep their existing5min window. | Visible directory or useful bounded intent prefetch. Commands invalidate affected keys; do not refetch every dashboard family. |
| Current financial/stock presentation | Keep the owning live-read contract; no blanket TTL increase. A retained display is never permission to act. | Fresh review/recovery/command checks remain. Money, stock, approval and related summaries update after canonical commands. |
| Access/proof/private receipts/activity targets | Fresh admitted mount/visit, normally0 freshness and often0 retention. | Cancel/clear on scope, target, proof expiry or fresh refusal. Do not join incompatible owners merely to remove skeletons. |
| Snapshot statements/exports | Infinity is valid only for a specific admitted snapshot/range/account/currency identity, with existing fresh entry checks. | Preserve explicit snapshot selection, export identity and current authorization. A cached statement cannot authorize a payment/refund. |
| Optional sheets/tabs | Retain loaded state within the same authorized owner where valid; bound visits and clear at scope boundaries. | Unopened features do not fetch or load heavy tools. Reopen/revocation follows the feature contract, not an invented global TTL. |
| Durable jobs/runs | Current status with existing bounded backoff and terminal/error/expiry stops. | Keep in-flight work/recovery alive where required. Idle hidden optional UI should stop unrelated polling without losing drafts. |
| Counts and notification badges | Fresh scoped read generations and bounded active polling; prefer count DTOs to full previews where authority permits. | Keep revocation/permission behavior. Remove duplicated projections/read work rather than displaying stale financial or access facts. |
| Public proof/preview/clinical links | Existing private/no-store/expiry and proof policy overrides normal UI cache. | Never apply ordinary directory retention to a customer capability or clinical/private payload. |

## Family application and evidence required

- Overview: retain its shell and independent sections; optional Setup/Assistant bodies
  load only on intent. Availability reads retain server-derived access.
- Catalog/Inventory: scoped detail visit keys and visited tab retention already have
  local proof. Raw server detail keys cannot hydrate those readers. Initial bounded
  reads, report payload and post-stock mutation freshness remain DP-402 work.
- Sales/Orders: retain draft and selected record identity; preserve fresh approvals,
  fulfillment/payment/refund checks and command-to-summary dependencies.
- Customers/Ledger/Finance: distinguish a live balance/review from a historical
  statement. Keep currency/account/book/snapshot identities and fresh command checks.
- Services/Requests/Conversations: selected-tab prefetch now follows the actual typed
  URL state. Preserve access-before-data, queue bounds, assignment/clinical reviews
  and current response indicators. Loaded Services tabs measured95/125ms locally.
- Assistant/Staff/Activity/Notifications: mount-owned sensitive reads stay fresh.
  Quick Assistant now forwards visibility to its actual hook, pending-review and
  voice query owners, with real observer/retention/recovery regression and UI proof.
  Pending commands/durable runs keep their owner alive; hidden auto-start is refused.
  Other polling owners and aggregate request-rate acceptance still need verification.
- Studio/Settings/Access: only an active generation/proof may poll; closed editors,
  public capabilities and role changes retain their existing ownership/expiry rules.
- Reports: current aggregates and a selected historical snapshot are different reads.
  Keep selected range identity, bounded aggregation and explicit export/job ownership.

## Acceptance still required

Apply the category at each relevant owner and document exceptions; do not mass-edit
all127 zero-freshness sites. Prove visible→hidden→visible, warm tab reuse, reopen,
rejection, expiry, actor/Tenant/Store switch and post-command freshness at actual
boundaries. Record request counts and cancellation with the existing QA tooling.
Source-only policy and fast revisits do not close DP-201/202/204 or family tickets.

## Server transport lifetime

The tRPC server client now shares the QueryClient's render-request lifetime rather
than a module-global transport. Streaming delivers independent ready results while
retaining one batch/admission per render owner. This introduces no stale cache or
browser freshness change. Pending hydration, fresh refusal clearing and concurrent
owner separation have actual transport regression proof; per-family runtime proof
remains required. Streaming responseSetup headers are not full request/SQL totals;
completed fixed server traces retain that distinction, including partial cancellation.
[Evidence](../verification/2026-10-29-dashboard-server-streaming.md).

## Notification polling contract —implementation follow-up

Midday reference inspected: hooks/use-notifications.ts and notification-center/
notification-center.tsx. Adopt hook/UI separation, while retaining EwaTrade's
mount-owned fresh/private reads rather than Midday's optimistic/realtime policy.

- [x] Move the four bell query hooks and unchanged fresh options into
  hooks/use-business-notification-reads.ts; components keep existing rendering,
  open generations, actions, exact invalidation/refetch and scope remount ownership.
- [x] Put the existing rejected-read classification in trpc/query-read-errors.ts;
  reuse it for current cache erasure and notification poll decisions. Only known
  FORBIDDEN/UNAUTHORIZED/NOT_FOUND stop intervals; transient failures keep cadence.
- [x] Preserve0 freshness/retention, fresh mount, abort ownership, focus recovery,
 30s payment/60s other active intervals and website panel's poll:false behavior.
  Never disable the owner or weaken fresh server writes/status/revocation checks.
- [x] Prove actual hook interval behavior with mounted real observers, denied payload
  erasure, independent mount keys, focus recovery, successful polling resumption,
  transient failure continuation and unmount. Run owned source/types/H02 and one
  existing-data bell/browser smoke window, then commit owned source and evidence.

No new UI/table/form/sheet/API/schema/provider, optimistic notification write,
realtime service, polling framework, broad TTL or command change is required. Other
pollers remain an explicit DP-204 audit/application obligation; this contract does
not complete the full ticket or dashboard program.

Conformance: four existing input/DTO contracts, mount generations, exact read/write
callbacks, private scope and0 retention remain. UI is unchanged. The source follows
the inspected Midday hook/UI split; EwaTrade retains protected fresh reads instead
of introducing realtime or optimistic writes. Broader polling audit still includes
Assistant/WhatsApp, Conversations, website inbox lists, private financial/receipt
review, attachment jobs and domain progress. Required live status, link expiry and
bounded private-proof owners must be inspected individually, not given a global TTL.
[Evidence](../verification/2026-10-29-dashboard-notification-polling.md).

## Infinite Catalog invalidation —30October2026

Actual mounted table/tRPC/query observers reproduced queryKey() type:query not
matching type:infinite. The new directory and touched full Catalog invalidations
use endpoint path keys or infinite filters. Matching server/client directory
hydration consumes1 prefetched read without another mount fetch. Creation marks
its directory stale without foreground refetch because existing RSC refresh owns
that reload; other stock/usage/graduation refreshes remain active. Draft counts do
not refresh stock. Broader infinite-owner/mutation audits remain DP-203 work; no
global TTL or all-dashboard invalidation policy is introduced.
[Evidence](../verification/2026-10-30-dashboard-catalog-directory.md).

## Orders and Prescription infinite invalidation —30October2026

The same typed-key mismatch is now reproduced and corrected at three additional
callback sites: Service intake's Orders list and Prescription intake/workspace's
queue. Existing procedure path keys match ordinary and infinite variants without
changing their inputs, activation, retention or server authority. Actual callbacks
refresh both active filter variants once and mark inactive variants stale; unrelated
data remains. No global cache clear, new TTL, command submission or clinical launch.

Direct AST audit of1108 production files finds26 infinite option sites/17 procedures;
all three ordinary-key overlaps are these invalidation sites, now zero. This excludes
aliases, manual keys and imported helpers, and does not prove all command-to-read
dependencies. The creation-effect follow-up below reviews Service intake's
Finance/Customer/ledger/search dependencies; typed matching alone does not complete
DP-203/406/501.
[Actual-callback proof and limits](../verification/2026-10-30-dashboard-infinite-list-refresh.md).

## Order creation effects —30October2026

Native Order and Service intake success now share an application-level dependency
owner. It targets19 current projection/lookup procedures, without invalidating an
entire Finance or Customer-ledger namespace. Cached live balances, owed/account/
Customer facts and current Finance reports refresh active observers. Customer
directories/search and operational/Service reports become stale for their next use;
they do not start eager lookup reloads while the creation form closes. Ordinary
Order creation also uses the existing Service queue/count invalidator because the
canonical command can create tracked Service work. Existing order/stock/usage and
RSC refresh ownership remains, including no foreground Order-directory reload from
ordinary creation.

Pinned account/Customer statements, account-ledger snapshots, supplier/bill lists
and Book metadata are outside this effect set. No new query, TTL, domain command,
authorization rule or snapshot generation policy. Actual callbacks and five live
cache observers prove the omission before/correction after, while uncached financial
reads stay absent. This supplies creation-effect coverage, not all DP-203 commands.
The shared Finance completion follow-up below checks its blanket prefix against
current/snapshot and account-setup dependencies at actual callbacks.
[Creation effects and proof limits](../verification/2026-10-30-dashboard-order-effects-refresh.md).

## Finance completion effects —30October2026

The shared Finance invalidator now preserves **loaded successful** fixed-sequence
`accountActivity`/`accountLedger` reads. An actual completion-hook reproduction
previously waited for a held statement reload before Close/toast; those loaded
statement queries now stay outside the invalidation wait. Latest, pending, failed,
absent and unknown key shapes retain their existing refresh behavior. Sequence0
is valid. The narrow classifier uses the installed SDK's public unprefixed key
layout; unrecognized layouts conservatively refresh.

Reports and journals stay refreshable even with a sequence: sequence-bounded
numbers alone do not establish an immutable DTO, and report account metadata can
change. This does not opt out private status/access reads, entry checks, recovery,
scope clearing or future fresh mounts. No freshness/retention TTL changes.

Explicit `money-accounts` completion refreshes cached Order payment choices after
money-account creation. `book-setup` additionally refreshes cached Customer-account
Book availability. Category creation retains the ordinary Finance-only effect;
existing bank-detail/payment-settings identity callbacks remain unchanged. No
uncached API read is manufactured. Direct source inventory finds21 completion
calls across20 form files, plus the separate shared recovery owner. This is shared
source reach, not runtime acceptance of every form or command.

Current mutable Finance namespace refresh remains broad; full per-command
dependencies are still DP-203 work. Next inspect the Customer-ledger command
runner's blanket invalidations and live/pinned effects at its actual success seam.
[Completion proof, UI and limits](../verification/2026-10-30-dashboard-finance-read-effects.md).


## Closed bell counts —30October2026

Closed shared bell uses numeric payment/plan/website projections, rather than
unused full previews. Open panels retain existing fresh private reads. Numeric
hooks retain0freshness/retention, mount/cancellation/focus/rejection rules and
30s/60s intervals. Payment review and plan dismissal refresh affected numeric keys;
website acknowledgement reuses its owning callback. No total-count semantic change
for the five-claim payment badge or new scoped website access. This is a DP-204/407
slice, not whole-dashboard lifetime acceptance.
[Receipt](../verification/2026-10-30-dashboard-notification-counts.md).

## Complete explicit interval audit —30October2026

[Current39-site ledger and A1–A6 subtasks](2026-10-30-dashboard-polling-audit.md)
supersede the earlier polling-site count, not the historical full query-option
inventory. AST scope:1,103 production source files,33 query intervals and6 explicit
timers across25 files;3 timers are UI clocks. Retained CSS-hidden children need
explicit activation even with TanStack's normal browser-focus gate. Numeric
intervals continue after errors despite retry:false; known private rejection
erasure is separate from interval shutdown. Reuse existing refusal classification
at proven owners with focus/manual recovery rather than adding a global TTL.

Inert mounted diagnostics reproduce P14 hidden/refused work and P15 duplicate
initial first-page operations. Preserve Finance page-one-only polling and private
freshness when fixing the latter. T03/T04 background/late-response concerns remain
source hypotheses. P28 needs bounded error/completion proof; durable uploads/jobs,
financial/approval/access queues and private proofs have explicit exceptions.
Other rows link existing evidence or state their source-only gap. No product edit,
runtime timing or DP-201/203/204 acceptance is claimed; overall3/27 remains.

## Assistant/staff interval conformance —30October2026

P18/P19/P21/P22/P23/P24/P33 now use the existing refusal interval helper. Known
FORBIDDEN/UNAUTHORIZED/NOT_FOUND stop only repeated interval work; active observers,
focus/manual/invalidation recovery, success cadence and global retry policy remain.
Freshness/GC/key/scope and mutation authority are unchanged. Staff non-review
keeps no interval and always-fresh focus; voice gateway/empty queues retain healthy
cadence.37 actual mounted cases plus classifier checks pass; broader owner and
optimized acceptance remain. [Receipt](../verification/2026-10-30-dashboard-assistant-staff-refusal-polls.md).

## Attachment status owner —30October2026

`setupAssistant.attachments.list` retains its reading-ID key and scoped read API.
It now uses0 freshness for current focus/reconnect recovery and SDK abort-on-unmount;
inactive cache retention and global retry policy are unchanged. Automatic1.5s
intervals stop on known refusal or a120s browser read window. Partial completion
keeps the same deadline; all-terminal/empty state removes its interval/deadline.
An already admitted read may finish READY after the window, and a fresh focus read
can recover without restarting expired intervals. Explicit Check again shares any
pending GET and rearms one bounded window. Timeout is not server FAILED: originals,
processing, editable transcripts, existing retry/remove commands and pending Send
guards remain. This is required durable-status recovery with a bounded automatic
read cost, not an optional hidden preview or a processing cancellation policy.
Actual13/117 and composer action, types, scoped checks and canonical development
retry pass; no live upload/provider, p95 or whole-DP-201/204 acceptance.
[Receipt](../verification/2026-10-30-dashboard-attachment-status.md).

## Base-route lifecycle checkpoint —30October2026

The existing canonical runner now records fixed-group RPC operations separately
from batches and can guard zero new API starts in controlled hidden/offline
windows for nine closed base representatives. Current optimized45 lifecycle
windows pass that scoped expectation; visible queue/count and focus/reconnect
recovery remain. This does not change any application freshness/retention/command
rule or apply the guard to active proof/job flows. Recursive receipt/socket/Setup
recovery exceptions are recorded in the extended polling audit. Missing stream
byte/phase measurements remain missing. Full DP-201/204 and per-family acceptance
stay open. [Evidence](../verification/2026-10-30-dashboard-read-activity.md).

## Customer Ledger completion effects —30October2026

Success and committed/rejected acknowledgement share an explicit application owner.
Loaded successful fixed Customer statement/continuation entries and totals avoid
routine refetch; currentRevision inside that DTO is informational, not pinned
command authority. Live accountDetail, account admission, funds/refunds/sources and
mutable Ledger reads still refresh. Fresh workspace refusal hides retained rows.
Known fixed Finance statements reuse their existing rule; latest/error/pending/
missing/unknown keys and mutable reports continue refreshing. No TTL/key or API change.

Mutable Finance/Orders keep current broad refresh. Customer Order-history detail
and Service job/ordinary+infinite queues/stage totals refresh explicitly. Pure
contact directories/count and Service settings/assignees remain unchanged. Actual
hook/runner/lock success/recovery/refusal tests, types, scoped checks and canonical
local retry pass; inert markers prove cache behavior, not live financial commands.
DP-203 and family/optimized acceptance remain open, overall4/27.
[Evidence](../verification/2026-10-30-dashboard-customer-ledger-read-effects.md).

## Existing Order-change effects —30October2026

Current Order detail/timeline/change-controls/Activity and its own message previews
remain awaited completion reads. A different Order preview does not belong to that
barrier. Deferred Orders stale marking excludes only successful just-refreshed
current keys; failed/pending/current-other keys retain recovery. No key or TTL change.

Behind completion, cached mutable Finance/Ledger, Customer history, scoped Catalog
detail and Service job/queue/count readers refresh explicitly. Known loaded fixed
statements stay pinned, latest/error/unknown readers still refresh, pure contacts
retain a stale marker without eager load. Existing stock/directory/search stale
markers and later route refresh remain; soft route refresh alone cannot prove
mounted client projections update. Current mutable prefixes are still broad.
Actual hook5/52, regressions9/74, types, scoped237/1533,H02 and local canonical smoke
pass. Inert markers establish read wiring, not live financial-command or optimized
budget acceptance. Overall4/27; DP-203 and broader family requirements remain open.
[Evidence](../verification/2026-10-30-dashboard-order-change-read-effects.md).
