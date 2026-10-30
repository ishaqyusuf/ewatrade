# Dashboard workspace and plan projection — 30 October 2026

Partial DP-103 and shared boot work for all nine Dashboard route families, under
the [full 27-ticket program](../plans/2026-10-29-dashboard-performance-program.md).
Primary checkout, local implementation/testing only. No deployment, schema,
migration, provider setting, global cache, business submission or fixture creation.

## Change and conformance

The private shell awaited current workspace choices, then a separate current plan
query before releasing its children. Midday's `packages/db/src/queries/users.ts`
joins the selected user's team plan/subscription facts into its navigation context.
This change applies that package-owned projection pattern to EwaTrade's existing
authority and Prisma relations.

`listDashboardWorkspaceMemberships` shares the general reader's exact actor/active
workspace predicates, creation order, Store projection and assignment mapper. It
adds only the existing bounded navigation-plan select. The canonical feature
projector is shared with `getRetailOpsTenantPlanFeatures`, including ignoring an
unknown durable plan before metadata/time policy, expiry and native/reviewer rules.
Tenant metadata and subscription fields are stripped before returning choices.

The existing request-local `getActiveTenant` owns selection and passes derived
features to the thin shell. An empty array remains authoritative Free gating.
Header selection, stale-cookie fallback, scoped Store filtering, default Store,
effective role, catalog permission and onboarding redirects retain their owners.
API admission and every command still recheck their current authority.

Optional plan data must remain fault-isolated. A failed joined read has exactly one
fresh base workspace fallback; this covers ordinary optional-relation failures as
well as missing billing tables/columns. The base read must succeed, and its error
propagates unchanged. Missing projected features leave the chosen Tenant with the
existing standalone plan reader and shell's existing optional-failure behavior.
This deliberately uses broader join fault isolation than only schema-error handling:
joining an optional dependency must not turn its ordinary failure into workspace
denial. There is no loop, cached admission, transaction retry or error-text logging.

The general workspace reader's output/query contract is unchanged. Full billing
snapshots, native/reviewer enforcement, labels/limits, subscription commands,
transactions, API procedure DTOs and provider operations are unchanged. No parallel
domain service, plan resolver or infrastructure layer was added.

## Verification

- DB focused/existing suites: 24 tests/379 assertions pass. All 27 canonical plan
  cases also exercise the joined projection against the full reader. Current
  rereads, independent arrays, cross-Tenant/inactive assignment rejection, optional
  join failure, missing tables/columns and distinct mandatory error identity pass.
- Actual Dashboard context: 5/25 pass. Chosen plan, safe returned fields, strict
  header/stale cookie, scoped Store/effective role and current plan changes are
  exercised through the real DB query module. Isolated actual shell: 6/13 pass,
  including zero second plan reads, authoritative empty features and existing
  fallback/refusal behavior. Separate Bun processes avoid global module-mock leaks.
- Owned DB/source-test graph and full Dashboard types pass. Explicit eight-path
  quick plan/check: 237/1533, QA tooling types and Biome pass, no unknown mappings.
  Foreign Agent Chat/staged explainers excluded. Feature regressions run separately;
  fast smoke is not full feature or release acceptance.
- One guarded existing-QA Owner comparison uses a read-only RepeatableRead
  transaction. Real SQL count is **2 → 1**; workspace output and selected plan
  features match exactly, and no raw billing facts escape. Sequential 439.0/218.6ms
  samples use a warmed pool and are not page timing or a causal speedup ratio.
  Initial private comparisons incorrectly used object-key-order-sensitive JSON
  equality; deep equality corrected the diagnostic without changing product source.
- Initial optimized build compiled but its embedded type checker exhausted the
  default 4GB Node heap. Standalone source checks passed. The retry uses the existing
  8192MB verification setting without relaxing checks or changing app configuration.

## Optimized local window and restoration

Next 16.4.3 build `Fp2hx3sRkDaie2XJkSXLj`, parent `8050855c` plus frozen owned
source/lock/manifest hashes. Retry compiled in 3.8s and completed its required type
checks. The first input-manifest command used the wrong working directory; the
successful retry captured all owned hashes before building. No check was disabled.

Canonical existing-data local smoke passes 11:25:34.156Z–11:26:48.689Z, including all
18 route-family readiness checks, exact QA account selection, populated Catalog,
existing sale draft item/total and cancellation. Zero business submissions, grants,
fixtures, messages or provider effects. The restricted browser invocation exited
before a journey; the authorized normal browser execution produced the passing
receipt. A preliminary optimized-server launch used a nonexistent binary path;
using the installed Portless executable corrected it without another service change.

| Family | Refresh | Warm return |
| --- | ---: | ---: |
| Overview | 1021ms | 1078ms |
| Catalog | 1547ms | 817ms |
| Orders | 2062ms | 813ms |
| Customers | 1031ms | 1319ms |
| Finance | 3318ms | 2338ms |
| Website requests | 2299ms | 816ms |
| Activity | 2822ms | 2614ms |
| General | 1148ms | 1318ms |
| Reports | 3274ms | 810ms |

These are single representative content-readiness observations, not p95, CWV,
accepted budgets or complete family acceptance. Reports refresh is slower than
its preceding 2552ms sample; other rows vary. No dashboard-wide latency ratio.

Activity refresh's document finished at 479.4ms, last script at 537.4ms, and its
shared list/filter batch started at 515.2ms (previous focused baseline 945.4ms).
Headers arrived at 1215.0ms and the batch finished at 2371.3ms. Refresh readiness
2822ms compares with the prior focused baseline 3007ms. This supports earlier
refresh startup in this sample alongside the independently proven query reduction.
It does not isolate a causal 430.2ms gain or establish a distribution. Warm return
starts at 474.9ms and remains 2614ms overall versus baseline 456.1ms/2619ms: return
latency remains open. Driver readiness after body completion is not a React profile.

Source/lock/four manifests match through the copied passing receipt and after
restoration. Dashboard 23587(dev) → 26550(optimized) → development restored via the
root launcher. API 48226, Storefront 46668 and Marketing 90981 stayed unchanged.
Development is Ready; original app configuration/generated type references are
restored and the optimized root manifests are retained. Trusted-CA doctor passes.
`runtimeVerified:false`: local evidence only, no release qualification or deployment.

H01 coverage inputs unchanged; valid evidence reused. H02 passes with one reviewed
client/domain record and zero capability/procedure deltas. Program remains 3/27
(11.1%); one shared query reduction does not close a full ticket. Next: current API
admission/control round trips and the still-slow warm return, remaining lifecycle
contracts and all-family budget acceptance.

Private evidence: `/tmp/ewatrade-dashboard-program-20261029/workspace-plan-*`.
The selected endpoint fingerprint matches the preceding local comparison; no
endpoint, profile, paid resource or topology was changed. Numeric summaries and
source hashes are retained; no SQL, query parameters, actor IDs or response bodies.

Brain feature, subscription-packaging, QA, task and BRAIN pointers updated locally.
No API/permission/public contract or database schema changed, so no endpoint/schema
document, migration or new architecture ADR is required.
