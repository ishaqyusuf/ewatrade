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
