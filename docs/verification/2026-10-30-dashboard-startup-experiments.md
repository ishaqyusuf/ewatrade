# Dashboard startup experiments — 30 October 2026

Partial DP-003/102/103/104/407 investigation under the
[full program](../plans/2026-10-29-dashboard-performance-program.md).
Both candidates below were measured locally and **removed**. Neither advanced the
observed start of Activity's own list/filter batch. Application source and the
previously validated optimized artifact were restored; development mode is running.
No new runtime optimization or ticket acceptance is claimed. Program remains 3/27.

## Hypotheses and results

The [baseline timeline](2026-10-30-dashboard-startup-timeline.md) put Activity's
first read almost a second after refresh began. Two Midday patterns were tested:

1. Pass guarded route context as a promise to a client `use(context)` boundary,
   following Midday's onboarding promise/Suspense pattern. A standalone Flight
   test emitted the component early, but its enclosing private shell still gated
   the actual application. This distinction invalidates the isolated timing premise.
2. Warm only Activity's public code outside that shell, following Midday's lazy
   global-sheet provider. The corrected Flight test used the actual enclosing shell
   and proved code-boundary delivery before session/workspace/plan completion.
   It imported no data and rendered no private child. Actual browser measurements
   still did not advance the read, so this candidate was also removed.

| Candidate | Refresh ready | Return ready | Refresh batch start | Return batch start |
| --- | ---: | ---: | ---: | ---: |
| Retained baseline | 3007ms | 2619ms | 945.4ms | 456.1ms |
| Context promise, removed | 3594ms | 3106ms | 982.5ms | 627.5ms |
| Public code warming, removed | 3017ms | 2608ms | 983.5ms | 482.9ms |

Single content-readiness observations, not p95 or causal total-latency comparisons.
The second candidate's similar total is not proof of a startup improvement. Its
batch headers/finish were 1644.6/2851.9ms on refresh and 1149.0/2374.5ms on return;
baseline was 1628.6/2773.4ms and 1101.4/2233.9ms. These are one shared streaming
list/filter batch, not two independently counted operations.

## Correctness, artifact identity and restoration

- Context candidate: standalone/mounted regressions 10 tests/58 assertions, source
  and fixture types, owned fast smoke 237/1533 and optimized build passed. The
  actual enclosing shell exposed the missing premise despite those passing checks.
- Code candidate: enclosing-shell/mounted regressions 5/34, source and fixture types,
  owned fast smoke 237/1533 and optimized build passed. Optional import rejection
  preserved shell operation; only the exact Activity route initiated warming.
- Both canonical focused optimized smokes passed existing-data readiness and return
  checks. Isolated invalid-cookie Next probes redirected to login with zero Activity
  reads and zero business writes. No fixtures, grants or business submissions.
- Candidates used Next 16.4.3 builds `5XM3eygRKgzKaaZtHcQjA` and
  `GHbfcBsfaEH1aCgJSq_qk`. Frozen source/lock/manifest receipts and candidate source
  are archived privately. Neither candidate remains in product source or the root
  optimized artifact.
- Restored root build `o7zCuLrMZYHJOvlfCX3EM` matches all four manifest hashes in
  `browser-stream-build-inputs.json`. The three touched runtime files match HEAD
  `8fb732654`; all experiment helpers/tests were removed. Existing development/cache
  directories were preserved. Dashboard development is Ready on its original port;
  API, Storefront and Marketing processes stayed unchanged.
- Reuse the valid retained-source types/build/smoke evidence: restored product source
  is identical. Experiment checks do not validate a new retained source change.
  Current change is documentation only; H01 source unchanged/H02 no gated change.
  Foreign Agent Chat and staged explainers are excluded from this milestone.

Private evidence: `/tmp/ewatrade-dashboard-program-20261029/`, prefixes
`activity-context-*`, `activity-code-*`, and
`activity-startup-experiments-dev-restored.log`. Receipts remain local and
`runtimeVerified:false`; no release qualification, deployment or provider change.

## Next bounded shared-shell change

The shell awaits workspace membership, then a separate current plan-feature read
before releasing any private route. The earlier
[plan projection](2026-10-29-dashboard-shell-plan-read.md) reduced the latter to one
query, but did not combine these stages. Next, project current plan facts alongside
Dashboard workspace choices and consume them from the existing request-local owner.

Keep the general membership reader's contract intact. Reuse canonical known-plan,
expiry, native/reviewer and metadata rules; return derived features only, without
raw billing identifiers/metadata in client context. A missing optional billing
table/column must not break mandatory workspace admission: retry the original
workspace projection and retain the current optional plan fallback. Unexpected
projection failures must preserve error identity. Header/cookie workspace selection,
Store assignment filtering, role rules, fresh API checks and transaction boundaries
remain authoritative. Prove healthy-path query reduction and policy/error parity
before making a page-speed claim.

Brain current feature, QA, task and BRAIN pointers updated locally. Runtime restored:
no schema, endpoint, permission or durable architecture contract changed by these
rejected experiments; no database migration or new ADR is needed.
