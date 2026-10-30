# Dashboard request workspace projection — 30 October 2026

Local implementation on source parent `b636ec94a`. No deployment. Full six-phase,
27-ticket program remains **3/27 accepted (11.1%)**; this slice contributes to
DP-102/103 and domain loading without closing their wider acceptance criteria.

## Cause and change

A remembered-business GET first read current Membership/Tenant preference and age,
then its first protected query repeated the workspace lookup. The red actual-Hono
test observed two scope statements; isolated previous Book/owed probes measured
about430ms combined scope work. Auth, QA proof and preference still account for
roughly640ms of context; this change does not remove that entire context cost.

The DB package now owns one generated joined preference query. Its conditional
nested membership returns the exact existing workspace projection only for an
eligible declared age and, when present, the validated QA Tenant/membership. The
outer cookie suggestion and age fact remain available without a protected profile
for undeclared age or foreign QA scope. No new account age threshold.

The canonical selector and mapper were extracted without token changes. Existing
workspace directory and protected-procedure implementation remain byte-identical.
The API seeds its existing per-GET memo only for the exact database identity,
actor, raw requested business and Store tuple; each reader gets a clone. Initial
eligibility remains lazy and precedes use of protected scope. A read observes the
current joined request-admission snapshot; no cross-request cache or TTL.

Explicit Tenant headers skip preference as before. Missing/revoked preference uses
canonical fallback. POST, mutation, linked-principal and default byte-reader paths
keep their existing fresh authority. Recovery with a different Store key cannot
consume strict selection. QA checks still run on every protected caller. Role,
Store assignment, default selection, metadata/plan policy and all command guards
and public DTOs remain unchanged. No schema or dependency changes.

## Focused validation

- Red reproduction: matching remembered-business protected GET originally used
  two scope statements. It now uses one, including parallel procedures.
- Actual generated Prisma query/decoder against disposable PGlite:6 cases/98
  assertions, including56 role/access-mode/Store combinations; all age bands,
  missing/revoked/inactive/foreign scope, SQL injection string, QA profile fences,
  nested subscription/date decoding and canonical plan parity. Synthetic data only;
  no app database fixtures. The initial minimal age-only SQL fixture lacked joined
  tables; it was replaced with this full generated-query execution proof.
- Actual Hono/context and request-owner tests:16 cases/97 assertions. Exact seed
  identity, copied results, new requests, POST, mutation, Store recovery and changed
  QA scope refusal pass. Canonical fallback and lazy age rejection retained.
- DB/API production plus owned-test type graphs and Dashboard types pass.
- Explicit owned-file fast plan/check passes:237 cases/1533 assertions plus QA
  tooling types/Biome. Foreign staged explainer files and AGENT_CHAT excluded.
- H01 coverage and reviewed H02 impact pass. No assistant capability promotion.
- Selector/mapper token parity, workspace-directory byte parity and procedure-tail
  byte parity pass. Relevant auth SDK/session/QA/domain command sources unchanged.

## Local runtime evidence and restoration

Approved Dashboard-only window:2026-10-30T05:43:17.952Z–05:44:41.103Z. Reused the
unchanged optimized Dashboard artifact from `b636ec94a`, Next16.4.3 BUILD_ID
`9_xXHBCwpx3JFUo5UurJb`, against the updated separately running hot API. Nine owned
source hashes, four manifests and lock verified before measurement; source and
manifests remained frozen through the passed receipt, copied before report edits.
This is not a newly compiled Dashboard candidate or a certified API revision.

All18 full-refresh/warm-return representative readiness checks pass, soft-navigation
shell retained. Existing QA Owner/data only, zero blocked business writes; existing
sale draft cancelled, order/stock sheets opened/cancelled. No fixtures, money,
grants, messages or provider effects. `runtimeVerified:false` remains explicit.

| Representative | Refresh | Warm return |
| --- | ---: | ---: |
| Overview | 1010ms | 1138ms |
| Catalog | 1848ms | 811ms |
| Orders | 2007ms | 817ms |
| Customers | 2267ms | 1312ms |
| Finance | 3510ms | 2327ms |
| Website requests | 2532ms | 818ms |
| Activity | 4205ms | 3103ms |
| General | 964ms | 1314ms |
| Reports | 1926ms | 813ms |

Isolated probes outside page windows: Book1747ms/8SQL, scope213.2ms/1read,
context658.8ms; current-mode owed1916ms/9SQL, scope221.0ms/1read, context640.3ms.
Pool0.1ms each. Both returned200 and resolved Book identity matched. Prior identical
Dashboard artifact probes were1963ms/9SQL and2180ms/10SQL with2 scope reads each.
The observed one-read reduction agrees with the generated-query/request proof;
live counts alone do not certify the complete API revision. Decoded JSON stays
9149/557 bytes, not compressed wire sizes; phases overlap.

Finance warm2327ms versus2847ms previously is520ms lower in these samples; refresh
3510ms versus3414ms is slightly higher. Activity4205/3103ms remains slow. Overview
and other families vary in both directions. No isolated causal, p95, Core Web
Vitals or broad budget acceptance claim. Fresh auth/QA and remaining metadata and
domain reads still dominate several paths; no stale permission cache introduced.

Dashboard43803(dev)→50198(optimized)→50735(dev), restored with root dev launcher.
API48226, Storefront46668 and Marketing90981 unchanged. Trusted-CA doctor passes
after restoration; optimized manifests preserved. No API restart or TLS bypass.

Private evidence: `/tmp/ewatrade-dashboard-program-20261029/workspace-scope-`:
`red.log`, `sql.log`, `context.log`, `{db,api,dashboard}-types.log`,
`quick{,-plan}.log`, `h01.log`, `h02.log`, `runtime.log`, `smoke.log`,
`doctor-{before,after}.log`, `{window,smoke-passed,parity}.json`,
`families/{route-families,performance}.json`; restore log
`dashboard-restored-after-workspace-scope.log`. Brain feature/API/permission,
current pointers and request-snapshot ADR updated locally.
