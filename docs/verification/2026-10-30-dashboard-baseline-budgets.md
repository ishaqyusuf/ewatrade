# Dashboard baseline and engineering budgets — 30 October 2026

DP-003 acceptance record under the unchanged six-phase27-ticket program. These are the engineering targets already authorized in the plan, now explicitly assigned to each family. Production SLOs are not established. Recording a miss never changes a target; meeting them remains DP-502 and the family tickets.

## Pinned baseline and sample limits

Use the complete normal nine-family run for Dashboard source `fea718366b368dccdee0db96339b02a6f71b3b35`, Next16.4.3 BUILD_ID `aXGxHvKxspRkA-sdcsSRx`, local optimized `next start` at the canonical Dashboard host. Source/test/lock and manifest hashes, service/profile identities and restoration are retained in the [root-policy receipt](2026-10-30-dashboard-root-qa-policy.md). Canonical receipt12809e59-0466-496d-b260-3d3bc3cc70ed passes15:49:17.265Z–15:50:36.129Z. The unchanged API process was48226. Complete hot API revision is not independently certified; this is a bounded local baseline with explicit attribution limits, not release qualification.

There is exactly **one refresh and one warm-return sample per family** (18 readiness samples total), desktop1280×900, existing QA workspace/records, no throttling and no business submission/fixture. Readiness is the fixed existing data locator in `scripts/qa-web-route-families.mjs`, not just a heading: Overview summaries; configured Catalog row; Orders content; server Customer summaries; three Finance panels; Website request list; Activity list; server General settings; Sales report headlines. These representatives cover the nine owners; they do not prove all59 pages or all descendants equally fast.

Data size is the existing bounded page/summary result. Baseline total business cardinalities were not captured and must not be inferred from newer UI counts. Payload/script observations below are numeric size evidence, not a claim to realistic large-dataset responsiveness (DP-304). Network cache is affected by the existing interception harness; browser request counts include Flight prefetch/cancellation and background queues. No comparison with development compilation or IAB bridge wall time is valid. Later receipts retain smaller code artifacts and additional timing observations; this earlier pinned baseline is retained rather than rewritten.

## Per-family budgets and baseline misses

All times are milliseconds from the action to the existing ready locator. Feedback means a visible navigation/pending response; a loaded-tab revisit means the retained authorized panel is visible without an avoidable skeleton. They are separate from useful page completion. Where a family has no such tab, apply the revisit target only to its real detail/tab owners. Feedback and revisit are not measured by this18-sample baseline; DP-304/501/502 retain that work. No p95 or statistical regression claim is made.

| Family | Full refresh target / observation | Warm return target / observation | Loaded tab revisit budget | Feedback budget |
| --- | --- | --- | --- | --- |
| DP-401 Overview | ≤2000; observed 947 (within) | ≤1000; observed 1073 (miss) | ≤200 where applicable; unmeasured here | ≤100; unmeasured here |
| DP-402 Catalog / Inventory | ≤2000; observed 1353 (within) | ≤1000; observed 821 (within) | ≤200 where applicable; unmeasured here | ≤100; unmeasured here |
| DP-403 Sales / Orders | ≤2000; observed 2048 (miss) | ≤1000; observed 819 (within) | ≤200 where applicable; unmeasured here | ≤100; unmeasured here |
| DP-404 Customers / Ledger | ≤2000; observed 990 (within) | ≤1000; observed 1323 (miss) | ≤200 where applicable; unmeasured here | ≤100; unmeasured here |
| DP-405 Finance | ≤2000; observed 3326 (miss) | ≤1000; observed 2339 (miss) | ≤200 where applicable; unmeasured here | ≤100; unmeasured here |
| DP-406 Services / Requests | ≤2000; observed 2795 (miss) | ≤1000; observed 819 (within) | ≤200 where applicable; unmeasured here | ≤100; unmeasured here |
| DP-407 Assistant / Activity / Staff / Notifications | ≤2000; observed 2306 (miss) | ≤1000; observed 2633 (miss) | ≤200 where applicable; unmeasured here | ≤100; unmeasured here |
| DP-408 Studio / Settings / Access | ≤2000; observed 2433 (miss) | ≤1000; observed 1320 (miss) | ≤200 where applicable; unmeasured here | ≤100; unmeasured here |
| DP-409 Reports / Analytics | ≤2000; observed 1948 (within) | ≤1000; observed 813 (within) | ≤200 where applicable; unmeasured here | ≤100; unmeasured here |

The100ms feedback,200ms revisit,1s warm-navigation and2s optimized-refresh targets are preserved from the authorized plan, not relaxed to accommodate current Finance/Activity costs. Local cold framework/compiler startup has its own observations and does not qualify as an optimized runtime miss/pass. The baseline fails five refresh and five warm targets; those misses remain actionable, not accepted family performance.

## Request, operation and payload costs

The same exact baseline rows produce this table. Refresh/warm pairs use their original ready-locator windows. Distinguish HTTP starts from RPC operations; one batch may contain several operations. Server-to-server work is not included in browser RPC totals. These are reference costs for DP-502 regression comparisons on matched inputs/windows, not assumptions that every endpoint can share the same request cap.

| Family | HTTP starts refresh / warm | Browser RPC operations refresh / warm | Refresh decoded script bytes | Observed refresh decoded API bytes | In-flight at readiness refresh / warm |
| --- | ---: | ---: | ---: | ---: | ---: |
| DP-401 | 70 / 1 | 10 / 0 | 2245736 | 374 | 3 / 0 |
| DP-402 | 79 / 3 | 5 / 0 | 2540111 | 0 | 4 / 3 |
| DP-403 | 75 / 5 | 6 / 0 | 2404656 | 374 | 2 / 1 |
| DP-404 | 72 / 6 | 5 / 0 | 2378059 | 374 | 2 / 0 |
| DP-405 | 92 / 8 | 5 / 0 | 2732506 | 1003 | 4 / 3 |
| DP-406 | 68 / 7 | 7 / 2 | 2087968 | 2134 | 0 / 1 |
| DP-407 | 70 / 3 | 7 / 2 | 2154779 | 26936 | 2 / 0 |
| DP-408 | 90 / 4 | 5 / 0 | 2403618 | 0 | 6 / 0 |
| DP-409 | 71 / 7 | 6 / 1 | 2541587 | 374 | 2 / 2 |

Observed decoded API bytes can be incomplete or zero while work is still in flight, cancelled or executed server-to-server; missing is never treated as zero work. Resource grouping and received-body scope are retained in the original JSON. Body counts are not total wire size. Newer complete settled-script captures in the form-import and notification-time receipts are used for subsequent code-byte comparisons, not substituted into this older latency window.

## Representative API / SQL / serialization attribution

The same pinned run includes two isolated existing-data GETs, with current admission and no command:

| Procedure | Elapsed / decoded bytes | SQL count / cumulative SQL ms | Pool count / ms | Context ms | Auth / QA proof / scope ms | Serialization count / ms |
| --- | --- | --- | --- | --- | --- | --- |
| finance.book |1490ms /9149 |7 /1466.6 |4 /0.1 |627.1 |206.9 /208.0 /212.1 |1 /0.4 |
| finance.owedSummary |1905ms /557 |9 /1881.4 |4 /0.1 |650.7 |230.7 /205.8 /214.1 |1 /0.1 |

Legal and domain phases were0–0.1ms; transaction controls420.9ms/2 and616.5ms/3. Phases overlap and are **not additive page time or network RTT**. The API serializer actually wraps SuperJSON with the named serialization phase (`apps/api/src/trpc/init.ts`), and the two real diagnostic responses contain the counts above. Browser timelines separately identify request starts, headers, completion, in-flight work and received bytes. These establish representative auth/legal/scope, API, SQL/pool, serialization and browser attribution; they do not establish complete per-family backend decomposition. Later snapshot/Book changes improve these reads and retain separate pinned receipts.

## Acceptance and remaining criteria

DP-003 is accepted locally: a pinned representative baseline, request/query/payload/latency costs, explicit sample/identity/visibility limits and measurable budgets for all nine families now exist. The initial IAB missed-click clocks, source-drift smoke failure and KRKy's18 polluted timing rows remain excluded. General/Website refresh regressions and warm Website1823ms versus816ms from separate runs remain unexplained observations; no causal improvement is claimed. Historical lifecycle counts retain their own proof and do not inherit acceptance from this baseline.

This does not accept DP-102 hydration, DP-201–204 lifetimes/invalidation/background work, DP-304 responsiveness, any family, DP-501 behavior, DP-502 regression checks or DP-503 overall completion. Original acceptance wording is unchanged. No runtime call, service restart, schema/provider change or deployment was needed to calibrate this table from retained evidence. Program becomes **6/27 (22.2%)**, with21 criteria open.

Evidence source: `/tmp/ewatrade-dashboard-program-20261029/root-qa-policy-families/route-families.json` (passed18 samples/two diagnostic reads), matching root-policy source/lock/manifest/commit receipts. The tables were generated from these numeric fields and independently checked against the tracked root-policy table; no user inputs, business payloads, IDs or credentials are copied.
