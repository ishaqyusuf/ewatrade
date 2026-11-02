# Dashboard Finance completion read effects —30 October2026

DP-203/405/501 source slice under the [27-ticket Dashboard program](../plans/2026-10-29-dashboard-performance-program.md).
Parent `816615576`, frozen nine owned source/test/impact paths and lock. Program
remains **4/27 (14.8%)** across all59 routes/nine families. This does not change
Finance's separate61-ticket roadmap acceptance or authorize a release.

## Confirmed defects and correction

`useCompleteFinanceForm` waits for shared Finance invalidation before Close/toast.
The old whole-Finance prefix refetched loaded fixed account statements too. An
actual completion-hook test holds a loaded pinned statement read: current live
reads finish, but Close/toast remain blocked until the unnecessary statement read
is released. Separate actual Account/Setup success callbacks reproduce stale Order
payment choices and Customer-account Book availability omitted by that prefix.

The shared hook keeps the existing mutable Finance refresh while excluding only
successful, defined loaded `finance.accountActivity`/`finance.accountLedger` reads
with a canonical fixed `snapshotSequence`. Both ordinary and infinite keys are
covered;0 is valid, signed64-bit bounds and canonical decimal syntax are checked.
This is cache-key classification, not authorization or validation that a sequence
exists. Fresh API admission and native statement validation remain authoritative.

Latest, errored, pending, missing-data, malformed and unrecognized keys continue
to refresh. Only the two known statement APIs qualify. Reports/journals remain
refreshable even with a sequence; report queries also project current account
metadata. No global “has a sequence, therefore immutable” policy. Classifier uses
the installed SDK's public unprefixed key type; unfamiliar/prefixed layouts take
the conservative refresh path. No key, scope, query input, staleTime or gcTime change.

Completion effects add only the needed cross-domain readers:

| Completion | Existing mutable Finance reads | Cached Order payment choices | Cached Customer-account detail |
| --- | --- | --- | --- |
| Ordinary Finance/category | Refresh | Unchanged | Unchanged |
| Money-account creation | Refresh | Refresh | Unchanged |
| Finance Book setup | Refresh | Refresh | Refresh Book availability |

Only existing cached queries are invalidated. Current bank-details and payment-
settings callbacks already own their identity refresh and remain unchanged. The
separate recovery owner inherits the same conservative default statement rule;
command identities, acknowledgement, status reads and locks are unchanged. Direct
AST inventory finds21 completion calls in20 form files; shared source reach does
not establish runtime acceptance of each form. Current mutable Finance refresh is
still broad and remains part of full DP-203 work.

The inspected Midday Customer form informs explicit affected-key invalidation and
thin form orchestration. EwaTrade's existing scoped snapshots, fresh entry checks
and command authority determine the narrow exception; no global SDK/cache defaults
are replaced.

## Verification

- The actual completion hook and actual Account/Setup forms mount through React
  SSR with real QueryClient, typed tRPC keys/options and captured success callbacks.
  Presentation leaves are inert; no API operation or mutation is allowed.
  Three cases fail before correction: pinned statement blocks completion, money
  account misses choices, setup misses choices and Customer-account detail.
- After correction, live balances/latest statements and report metadata refresh;
  three loaded fixed statement/ledger probes stay untouched and cannot delay
  Close/toast. Failed statements still retry. Account/Setup refresh only their
  intended cross-domain markers; category and unrelated Order-directory data remain.
  Probes use numeric cache markers and inert query functions, not financial DTOs,
  monetary correctness, real server latency or financial command acceptance.
- Pure classification tests use actual SDK normal/infinite keys,0/max/invalid
  sequences, error/pending/absent states, report/journal/other-domain conservatism
  and unknown/manual/prefixed key layouts. Final **9 cases/55 assertions** pass;
  isolated wrapper passes. Initial missing presentation ports and a fixture-only
  mutable/readonly observer storage type were corrected without type assertions.
- Full Dashboard and fixture graphs pass typing. Owned nine-path quick scope
  **237/1533** plus QA tooling types/Biome passes, zero unknown mappings; foreign
  Agent Chat/staged explainers excluded. Final fixture cleanup has separate runtime/
  type/format proof. H01 unchanged API/capability evidence reused; reviewed H02
  passes one client record, zero capability/procedure deltas. No dependency added.
- Emitted Account/Setup component code is identical after excluding only the added
  completion-effect argument. Completion body is identical after excluding that
  invalidation argument. Native payload/validation/pricing/money, draft/default
  state, Close/toast order and server financial authority remain. No API/database
  command, scope, permission, transaction or recovery implementation change.

## Local UI and operating boundary

Initial QA availability returns404/unavailable before UI starts; failure remains
closed. A later read-only check returns200/available without service restart or
policy change. The exact intermittent cause is unproven. Canonical development
smoke passes **14:22:47.657Z–14:23:13.390Z** with exact frozen inputs/lock: existing
QA login, populated Catalog, Order draft/item/total and Cancel. No failed smoke run
is hidden by that readiness recheck.

Sequential IAB check opens existing QA Finance→Money accounts→Add account. Name,
account types and accepted payment fields load. Untouched Cancel returns to the
list with the same count; temporary tab closes. No field entered, account created,
setup submitted, payment, fixture or provider action. Actual financial completion
effects are proven at the inert seam, not by a live business submission. Next's
development issue badge is visible; no console-clean or whole-Finance UI claim.

Dashboard49718, API48226, Storefront46668 and Marketing90981 remain unchanged.
No runtime switch/restart or deployment. `runtimeVerified:false`; no optimized
timing, p95, budget, native-command or release qualification. The earlier KRKy
optimized artifact predates these changes and is not requalified by this smoke.

Private `/tmp/ewatrade-dashboard-program-20261029/finance-invalidation-*` retains
red/green/wrapper/type/quick/H02 logs, owner inventory, parity, input hashes,
availability result, passed receipt and fixed UI observations. Unrelated browser
tabs/data are not retained in these artifacts. Brain BRAIN/task/QA/navigation,
merchant Finance and financial reporting checkpoints updated locally. No API,
schema or durable architecture change requires migration/API docs or an ADR.

All23 open program tickets, including DP-203, remain open. Next inspect Customer-ledger
command-runner invalidation at actual success boundaries, including its five broad
namespaces and snapshot/live dependencies. Scope/freshness, remaining family and
interaction acceptance and optimized navigation budgets retain their original criteria.

## Addendum — record-list and bank-detail effects (2 November 2026)

The lost product patch for the applied regression fixture was rewritten. Completion
effects are now:

| Completion | Mutable Finance reads | Loaded bills/cash counts | Order payment choices | Bank-detail cards | Customer-account detail |
| --- | --- | --- | --- | --- | --- |
| Ordinary Finance | Refresh | Refresh | Unchanged | Unchanged | Unchanged |
| Spending category | Refresh | Kept | Unchanged | Unchanged | Unchanged |
| Money-account creation | Refresh | Kept | Refresh | Refresh | Unchanged |
| Payment settings | Refresh | Refresh | Refresh (once) | Refresh | Unchanged |
| Finance Book setup | Refresh | Refresh | Refresh | Unchanged | Refresh |

"Kept" applies only to successful, defined `finance.bills`, `finance.cashCounts` and
`finance.cashCount` reads with the public two-part key: they list existing records,
which creating an account or category cannot change. Failed, refused, pending and
unfamiliar/nested keys still refresh. Payment settings now refresh order choices
through the shared effect instead of a separate earlier call. Loaded fixed statements
keep the original exclusion. No key, input, staleTime, gcTime, permission or server
change.

Evidence: fixture old source 5 pass/3 fail; after fix **8/8, 76 assertions**; wrapper
and existing classifier tests 7/72 pass; Biome on changed files; H02 gate passes.
No typecheck, browser, device or live submission. UI acceptance deferred by owner;
DP-203 remains open and program progress is unchanged.
