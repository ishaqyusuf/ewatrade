# D04 canonical performance proposal v1 — 12 October 2026

Status: source-only proposal for parent review. No production implementation,
connected run or timeout change. The scheduled four-case v3 attempt failed at
first-case owning Order read;0/4 cases completed, covered saved state unchanged,
Prisma disconnected and exclusive QA slot released. Existing D04 source/reports
are committed in checkpoint a91961b0 and remain frozen pending proposal review.
D04 stays unaccepted.

## Evidence and selected optimization

Fixture209ms is no longer a material setup cost. Execution20386ms plus
replay6837ms leaves no room for owning Order/message/receipt assertions. The
baseline has two Offering delegate spans2013ms and2005ms, an Order graph read
1816ms, and complete Job hydration spans3212ms/3211ms. These are delegate spans,
not SQL counts. The existing schema/client has no relationJoins preview feature;
this proposal does not require one, a driver change, migrations or raw hydration.

Implement one canonical command write core with explicit caller-selected result
loading, then batch equivalent Offering resolution reads. Both are real canonical
optimizations applicable to native commands; neither shortens the verifier or
replaces the required owning receipt. Retain both complete Job hydrations and all
fresh authority/revision checks in the first implementation. These changes have
not been implemented and are not demonstrated to fit30s yet.

## Measured baseline and change budget

| Proposed change | Actual observed delegate span | Proposed read reduction |
| --- | ---: | --- |
| Batch equivalent Offering graph reads | 2013ms +2005ms | Two unique ordinary Service reads become one equivalent batch; actual batch latency unknown |
| Canonical Order summary result for Intake | 1816ms | Full discarded Order graph becomes persisted id/number/total projection, while public Order callers retain full output |
| Pass persisted draft to private confirm body | 401ms duplicate Intake read | Remove only the immediate same-transaction reread; standalone confirm still loads/tenant-checks |
| Tracked line projection | 806ms | Keep Order line and immutable snapshot; remove unused Offering/serviceOffering relations |
| Gate reminder reads after cancellation | Overlapping settings207ms/timezone401ms | Keep cancellation; avoid settings/timezone when absent phone makes reminder impossible |
| Full Job hydration | 3212ms execution;3211ms replay | Retain both complete reads and results |

The first two changes have the strongest measured basis. Single basic reads in
this run commonly took about200ms, so a full graph-to-header reduction and a
combined Offering batch could plausibly save several seconds, but they do not
establish a measured saving or enough headroom. No timing span here measures a
future implementation. Do not add overlapping spans or treat all removed graph
queries as latency-free replacements. The owning Order/message/receipt phases
still require additional time after execution/replay and must complete atomically.

Review/implementation order: canonical Offering batching and shared write-core
result seam first; then the three narrow Service changes. Implement each with
contract checks, without connecting, before scheduling the unchanged full suite.
If the measured next run still misses30s, it remains a failure; do not redefine
success, omit the owning receipt, widen limits or execute a narrower verifier.

## 1. Batch native Order Offering resolution

Target: packages/db/src/queries/commercial-orders.ts:717–818.

The current command caches repeated Offering keys but resolves each unique key
with a separate deep findFirst. The two distinct Service Offerings therefore
repeat the same relation traversals. Replace unique-key reads with command-local
findMany batches grouped by eligibility mode: ordinary ACTIVE versus progressive
ACTIVE/DRAFT. Keep the exact original tenant/catalog predicate and complete
include graph (catalog item, product unit/inventory unit, service policy, current
Store availability, variant selections/group/value). Build separate maps keyed
by [Offering ID, progressive flag]. A DRAFT read for progressive mode must never
populate the ordinary map. Custom built-in Offerings keep their existing path.

Process input lines in their original order after reads. Preserve each line's
not-found/work-policy/availability/attestation checks, per-line price resolver,
expected price/quote validation, quantity precision, note rules, stock reservation,
canonical financial locks and writes. Duplicate lines still create duplicate
Order lines with the original quantities and snapshots. Missing entries produce
the same typed failure at the same line-processing step. No broad authorization
predicate, persistent cache, model-provided resolved graph or trusted-input flag.

Expected benefit is one equivalent relation batch instead of two for this case,
and bounded batches rather than one per distinct line on larger Orders. The
measured two2s spans support a possible reduction near2s here, but the actual
batch duration must be measured; it is not guaranteed or additive proof.

## 2. Separate canonical command writes from full Order output loading

Target: commercial-orders.ts:589–1167; service-work.ts:828–857.

Extract a private canonical write core that preserves schema/input checks,
payload hash and client identity, Store/customer resolution, financial context
locks, Offering/price/stock checks, all order/line/snapshot/authorization/ledger/
Finance effects, customer capture, initial payment, fulfillment and failure
behavior. It yields the persisted Order identity only after all required effects.
Use a small idempotency header query to check the payload hash on replay; public
Graph/serialized callers still load their full original graph inside the same
caller transaction before returning. Preserve the root unique-conflict retry and
full original public API response. Do not cache a serialized response across a
payment or fulfillment update.

Expose an internal canonical summary entry point for Service confirmation using
the same write core, loading id/orderNumber/totalMinor from the persisted record.
Source confirms that confirmation consumes only these three Order fields: IDs
for links/payment, total for payment authorization, number for reminder wording.
It separately loads tracked Order lines and later complete Job graphs, so loading
then discarding the complete Order product fulfillments/returns/reservations/
service authorization/fulfillment/payment graph at1816ms is redundant.

Summary loading must run after the core's effects and within the same transaction.
It is not an alternative reduced-validation command. Initial Intake payment still
uses the canonical payment command and final Job hydration reads updated Order
payment state. Full Service response, financial identity, snapshots, payment gate,
notifications and owning receipt are unchanged. Public Order callers never receive
a summary accidentally. Do not expose a model-switchable skip/hydration flag.

## 3. Remove proven duplicate native Service reads

Targets: service-work.ts:684–810,863–870,371–411.

- Create-and-confirm currently gets a persisted Intake including lines from draft
  creation, then immediately queries the same Intake including lines again.
  Extract a private confirmation body accepting that transaction-local persisted
  graph. The existing public confirm entry continues to load and tenant-check its
  own graph. Atomic composition uses only the graph returned by the canonical
  draft function, with matching Tenant/schema checks; no caller-supplied graph or
  stale pre-review result is accepted. Both paths retain all confirmation rules.
- Tracked Order line loading includes Offering/serviceOffering, but confirmation
  uses only the persisted Order line and immutable snapshot authorization policy.
  Drop only those unused relation reads, retaining the whole Order line and
  snapshot, tracked filter, snapshot policy failure and every allocation/event.
  This does not change the returned Job graph or replace policy with current data.
- replaceDueReminder must still cancel outstanding due reminders. After that,
  an absent customerPhone already guarantees no reminder under current behavior;
  return before settings/timezone reads in that branch. Otherwise load settings
  and test current automatic/channel eligibility, then read Tenant timezone only
  if rendering a reminder. Keep cancellation, eligible reminder upsert/event keys,
  timing/channel/default settings and exact truthiness behavior unchanged. Never
  infer that no phone means no existing intent to cancel.

These avoid the measured duplicate Intake read (~401ms), unused tracked-line
relations, and no-reminder settings/timezone work. Keep production intake
preparation, current authority/customer/assignee/revision review, Commercial Order
financial locks and both full Job hydration reads. Reusing the stale original
review, returning a compact Job, or moving receipt work after commit is excluded.

## Contract checks required before another scheduled measurement

Use focused provider-free tests with persisted fixture returns to compare the
old and refactored public Order/Intake outputs field-for-field. Verify ordinary
versus progressive same-ID separation, missing/wrong Tenant/Store Offerings,
duplicate distinct lines, quantity/price/quote/attestation failures, product
reservations, custom lines and replay mismatches. Verify exactly one bounded
transaction and rollback on each write-stage error. Public direct/native two-step
confirmation and atomic confirmation must retain their same outputs/errors.

Check native paid/unpaid/manual-release/charge-only work, persisted snapshots,
assignee/due histories and notifications; reminder cancellation remains observable
for an absent phone, while eligible reminders retain timezone/default channel.
Financial graph, payment command and customer identity effects must match. Scoped
actual-source TypeScript and owned-file lint must pass. These are proposed tests,
not completed evidence for code that has not been written.

Then, only when the coordinator schedules it, rerun the unchanged four-case
canonical runner with every original assertion and maxWait10000/timeout30000.
All four cases, including owning receipt, must fit and preserve full state.
No signed run is implied. If combined savings are insufficient, inspect the
unchanged Job hydration query plan separately; do not fabricate empty history or
introduce a global relationJoins/schema change as a local workaround.

## Proposed edit ownership and frozen handoff

Implementation would touch service-work.ts and shared commercial-orders.ts;
parent coordination is required before either is edited. Neither was changed
by this proposal. Current D04 source, fixtures, verifiers, tests and versioned
reports (28 paths,27 present in checkpoint) are enumerated in ignored artifacts/assistant-operations-parallel/D04/
owned-paths.json. Brain and artifact files must not be force-added. Central
registries/exports/public integration remain parent-owned. No git mutation here.

## Final checkpoint reconciliation

Read-only Git verification resolved checkpoint a91961b0 to
`a91961b0ad98d33405dbdd0fb23617d35a1b61cc`. All27 source/fixture/verifier/test/
actual-result report paths are present in the checkpoint and clean in the working
tree. The28th owned path is this performance proposal, which remains untracked
and is the sole pending own stage candidate. The complete array remains
owned-paths.json; pending-paths.json contains only this proposal. The parent owns
review and any subsequent stage/commit. No native edit or connected rerun occurred.
The source freeze continues until the parent finishes proposal review.

Remaining acceptance gates are unchanged: initial-payment Finance support,
automatic reminders or accepted scope exclusions, signed rollback, actual saved
web chat/object navigation and explicit ticket acceptance. Source checkpoint and
performance proposal do not change13/45 (28.9%) accepted progress.
