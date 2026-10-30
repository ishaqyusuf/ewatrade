# Finance Overview document prefetch — 30 October 2026

Parent `ecec707c8`. DP-102/103/405 implementation slice; full performance program
remains 3/27 accepted. Current primary checkout, local only; no deployment.

## Finding and implementation

The actual Finance route awaited and hydrated the Book. Its three Overview panels
then started their reads at client mount, adding a client-code/hydration dependency.
The new route starts the existing balances, owedSummary and five-item bills queries
once Book admission succeeds on a full document load. Their pending queries enter
the existing HydrationBoundary. Each unchanged panel keeps its loading, data and
error owner. The route does not await those three reads.

Soft navigation keeps the original browser cache/freshness/invalidation lifecycle.
Next16.4.3 hides its raw `rsc` request header from route-level headers(). Middleware
therefore overwrites `x-ewatrade-request-kind` from the raw method/Flight header.
Only a classified GET document enables prefetch; soft navigation, prefetch, POST,
HEAD and missing-marker requests retain browser ownership. This avoids three extra server reads on an already
cached return. A cold soft visit retains its prior browser-owned reads. This header
selects scheduling only; no caller can choose a different authorization policy.

Only the Overview document branch changes. Accounts, Reports, Spending, Suppliers
and Bank keep their existing selected prefetches. No cache window, API input/output,
Book/account scope, exact amount, command, permission, schema or UI design changes.

Midday reference: its Customers route starts visible summaries with batchPrefetch
before HydrateClient. EwaTrade adapts that pattern to its measured retained-return
budget rather than warming every read on every navigation. Existing typed query
keys and the per-render QueryClient are retained; no additional cache or runner.

## Focused validation

- Actual route/Workspace/Overview, URL hook, tRPC options and QueryClient/hydration
  run with inert SDK/data/presentation ports. The parent regression starts only
  Book; it fails the expected early panel-read assertion.
- Fifteen mounted cases pass,76 assertions: completed hydration has exactly four
  total reads (Book plus three panels), with no second consumer read. Pending
  panels start together, route returns before they finish, and each displays its
  own result independently.
- Unauthenticated/role refusal and pending/missing/refused Book never start the
  child reads. All five other views retain their exact expected operations.
- Book-B pending balances cannot consume a retained Book-A query. The canonical
  useFinanceInvalidation still refreshes all four active projections. A fresh
  refusal erases its prior private panel payload while other panels remain visible.
- Initial failed pending hydration follows TanStack's existing redaction and one
  normal retry to a current403; its panel shows the existing error without hiding
  healthy panels. The expected inert redaction diagnostic remains in the log.
  The first harness omitted the real403 HTTP status, causing unintended retries;
  fixing that fixture did not change production retry behavior.
- A warm soft return performs only its existing server Book read and consumes its
  retained panels. A cold soft visit performs the original browser panel reads.
- Dashboard and owned fixture types, installed Next header and source parity checks
  pass. Apart from the new document branch/import, the entire route matches its
  parent. Middleware differs only by the scheduling-marker import/stamp;
  authentication, redirects, privacy and forwarded context remain identical.
  Sixteen middleware cases/144 assertions include forged-marker overwrite and
  unchanged sign-in refusal. The installed request-store probe confirms raw rsc
  is hidden and the scheduling marker stays visible. Consumers, invalidation,
  retry/cache policy, Finance API/DB authority,
  transaction controls, journal readers and lockfile are unchanged.

Scoped fast checks pass:237 tests/1533 assertions plus QA tooling types/Biome.
H02 passes with zero capability/procedure changes. H01 evidence from ecec707c8
is reused: API/auth/capability production source is unchanged. The canonical
local UI run is recorded below.
Foreign Agent Chat/staged explainer changes are excluded from owned checks.

## Limits and remaining work

This schedules existing reads earlier; it does not remove their database work or
prove a browser speedup. Expensive owed-summary/unbounded directory projection and
remaining Book/API startup costs stay in DP-103/405. Cold soft navigation is not
accelerated by this document-only branch. Per-family optimized budgets, command/
revocation acceptance and the rest of the 27-ticket program remain open.

Prepared optimized artifact f027 is unchanged and excludes this later source.
No service restart, business fixture, financial/grant/age mutation or provider
operation. Focused mounted ports prove read ownership, not live money behavior.

Private evidence root `/tmp/ewatrade-dashboard-program-20261029/` contains
`finance-prefetch-{red,probe,tests,types,dashboard-types}.log`,
`finance-prefetch-parity.json` and subsequent frozen runtime evidence.

Brain impact: BRAIN/task pointers, navigation-performance and merchant-finance
features and existing web-performance ADR updated locally. No API-contract,
permission or schema documentation change required: existing authorities and DTOs
are unchanged. No new Finance roadmap leaf or release acceptance is claimed.

## Correction before final acceptance

The first full-family smoke passed visible journeys, but its initial route check
read the raw `rsc` header. Inspection of installed Next's actual request-store
implementation showed that header is hidden from userland. That first run is
preserved under `finance-prefetch-pre-marker-*` and does not prove the final
navigation budget. The middleware-owned marker fixes the boundary; final source
checks and browser evidence below supersede it. No deployment or shared restart.

## Final frozen browser run

Canonical existing-data local web smoke with the existing nine-family option passes
2026-10-30T04:00:15.962Z–2026-10-30T04:01:27.717Z. All12 source/consumer/lock hashes
match after the run. All18 family samples complete, retained sidebar true, zero
blocked business writes; QA login, populated Catalog, draft total and cancellation
pass. No service was restarted and no business action submitted. Development mode
remains selected. RuntimeVerified=false retains the local evidence limitation.

Final development observations: Finance full refresh5578ms/warm return2881ms;
Activity3558/3170ms and Catalog1845/864ms. These single, uncontrolled samples do not
prove a causal speedup, p95 or the target budgets. The exact no-duplicate/soft-return
read budget is established by the mounted middleware/query tests; browser samples
prove rendered content readiness and the representative shell journey.

Private `finance-prefetch-{frozen,smoke-passed}.json`, `finance-prefetch-smoke.log`
and `finance-prefetch-runtime/{route-families,performance}.json` retain final
source hashes, limits and numeric results. The earlier pre-marker run stays
separate. Preparedf027 manifests still match and exclude this source.
