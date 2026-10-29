# Vercel CPU investigation — 29 October 2026

Read-only provider investigation and one local source optimization. No deployment,
provider/plan/settings change, SQL probe, live application request, email/model
call or business submission. Times below use Africa/Lagos unless noted.

## Findings

Authenticated Vercel Hobby team `ishaqyusufs-projects`, shared account
`team_BV5rgKHJH4fMyFL1YfscZIZK`. API project
`prj_ykC8ltJlPgEuFN90CQhFpC5uC3Vh` / `ewatrade-api` matches the repository binding.

| Evidence | Observation | Meaning |
| --- | --- | --- |
| Shared rolling 30-day usage, Sep29–Oct29 | About9CPU-hours /4hours included | Existing account-wide exposure; not a fresh monthly reset on1November. |
| API rolling 30days, all deployment environments |3h59m CPU,8.1Kfunction invocations,8.3KCDN requests,20.51MBfast transfer | API is44.4% of historical shared CPU. Rough aggregate ratio1.8CPU-seconds/invocation is not request latency or endpoint attribution. |
| API last7days, Oct22–29 |18m35s CPU | About1h20m/30days if this week repeats; substantially below the historical rate. This is a scenario, not proof of future demand or savings from a particular change. |
| Historical daily tooltip |21October35m41s API CPU | Large older spikes remain in rolling usage; the current quiet period cannot identify their callers. |
| Production Functions, last12hours around14:40 |4invocations,226ms aggregate active CPU,75%cold starts | No evidence of a frequent ongoing Production monitor in this window. Hono is reported as one bundled `/` function route; this is not proof all four requested `/`. |
| All-environment Functions, last12hours around14:45 |8invocations,386ms active CPU,87.5%cold starts | Small recent nonproduction/production footprint. The observations were minutes apart; not a historical environment split. |
| Retained Production request,14:19:30 |GET `/`,404;32ms execution;Cold3.44s;174MBpeak | Current deployment `dpl_CxVtNE7CULw1VVFUVPnwdRTYRUip` matches27October cutover. Cold-start latency is not billed CPU time. Generic browser User-Agent does not establish a bot, monitor or human identity. |

The visible, rounded project totals for the shared last7days sum to about82m52s:
API18m35s(22.4%), Ewa marketing12m24s(15%), Halaalvest dashboard7m48s(9.4%),
afterservice dashboard6m49s, Logly5m41s, afterservice marketing5m40s,
Oversight5m39s, Halaalvest marketing5m32s, Ewa dashboard5m02s,
School dashboard3m44s, with smaller projects contributing the remainder.
These are project costs across environments, not solely Production or these
three businesses.

At unchanged seven-day activity, shared usage extrapolates to about**5.9CPU-hours
per30days**. Fitting4hours requires roughly**32%less CPU across the account**.
The sustainable30-day allowance is about8CPU-minutes/day; recent usage is about
11.8minutes/day. Even eliminating API CPU entirely would leave approximately
4.6hours/30days at the other projects' recent pace. An API-only fix cannot make
this historical scenario fit Free by itself.

## What can and cannot be attributed

1. Historical/spiky activity is confirmed; specific old requests/callers are not.
2. Cold initialization is a measured current latency and local CPU opportunity.
3. Persistent high-frequency polling is not supported by the recent API count.
4. Auth/data access and rendering remain candidates to profile under real demand;
   their source presence alone does not establish their share of the old bill.

Free Observability accepted the12hour view but gated24hours and detailed Paths.
The Paths upsell contains sample `/api/blog`, `/api/demo` and similar rows; these
were visually confirmed as an upgrade preview and **excluded** from evidence.
The log view accepted its30minute window and rejected the attempted longer range.
Runtime logs in that accepted window were empty; one request record was retained.
No upgrade, historical-log reconstruction or new production instrumentation was
attempted. Query/SQL wait or cold wall time was never relabeled as CPU.

Provider references: [team CPU usage](https://vercel.com/ishaqyusufs-projects/~/usage/vercel-functions-fluid-cpu-duration),
[API usage](https://vercel.com/ishaqyusufs-projects/ewatrade-api/usage),
[API Functions](https://vercel.com/ishaqyusufs-projects/ewatrade-api/observability/vercel-functions).
[Vercel documents](https://vercel.com/docs/observability) the paid path/latency
breakdown and longer retention; [Hobby documentation](https://vercel.com/docs/plans/hobby)
does not promise a calendar-month reset.

## Offline initialization profile and local change

Synthetic database/auth configuration only. Network `fetch` and Node socket
connections were guarded; zero attempts were observed. Fresh processes imported
the actual local API and made one in-process `/api/live` request. No listener,
database, hosted app, fixture records or real credentials were used. A second
variant loaded the existing health-route module with Hono, not the API graph.
This current, busy source checkout contains unpublished concurrent work and is
not the deployed Vercel bundle or a controlled production billing experiment.

Three unprofiled runs before the change:

| Variant | Median import wall | Median import process CPU | Startup RSS | Liveness handler wall |
| --- | --- | --- | --- | --- |
| Full API |1489ms |2589ms |759–762MB |5.1–5.4ms |
| Health-route comparison |18ms |48ms |58–61MB |1.1–1.5ms |

Sampling found substantial module parsing/instantiation/resolution, plus email
syntax-highlighter initialization, taxonomy normalization and Prisma setup.
The `fetch` native frame in the module-loader profile is not evidence of an
outbound HTTP request. The instrumented profile has overhead and is excluded
from before/after timing comparisons.

The Orders router eagerly imported `@ewatrade/order-receipts/pdf`, which initializes
React PDF and its font/rendering dependencies even when no receipt is requested.
**Changed only that import to load on demand inside `orders.prepareReceipts`,
after existing entitlement, role, Store scope and source receipt reads succeed.**
The same renderer, PDF bytes contract, images behavior, error handling and money
data remain. Module caching is the runtime's normal import cache, not cached
authorization or receipt data. The first actual export now pays renderer loading
latency; unrelated requests avoid it.

An isolated mocked-renderer comparison showed roughly40–50MBlower startup RSS;
CPU differences were noisy. Three real post-change runs showed719–722MBRSS,
1384–1487msimport wall and2372–2552msprocess CPU. Concurrent source activity and
unbundled/development execution limit precise percentage comparisons. **No live
CPU-hour saving or claim that this change alone restores Free compliance.**

Private local evidence under `.brain/qa/evidence/2026-10-29-vercel-cpu-investigation/`:
`offline-profile.json`, `pdf-contribution.json`, `after-lazy-pdf.json`, profiler
Markdown/CPU trace and synthetic profiler source. The first profile attempt
refused the actual non-loopback local profile; subsequent runs used only synthetic
configuration. An experimental import-interception unit check could not be
qualified because its child diagnostics were unreliable; it was removed rather
than retained as a false regression signal. Existing behavior tests and the
fresh-process measurement provide the validation below.

## Validation and limitations

- Offline QA doctor passed without runtime/database probes.
- `test:quick --plan --files apps/api/src/trpc/routers/orders.ts`: no unknown paths.
- `test:quick --files apps/api/src/trpc/routers/orders.ts`:226tests/1226assertions;
  changed-file Biome and QA tooling types passed. Explicit owned-file scope
  excludes concurrent changes from source acceptance.
- Existing receipt permission, source validation, monetary facts and real PDF
  parsing/rendering tests:9tests/39assertions passed with a synthetic DB URL and
  no connection. No new permanent test or business fixture.
- Assistant capability/gate tests:19tests/39assertions passed. H01 coverage snapshot
  check passed. H02 is evaluated against only the owned change and its record;
  no assistant procedure/manifest change.
- Full API `tsc --noEmit` reported5errors in other tests:
  `general-customer-allocations.test.ts` missing two new fields(two diagnostics),
  `product-share.test.ts` missing storefrontPolicy(two), and
  `customer-ledger.test.ts` missing refund procedure inputs(one). None names the
  edited Orders file. Concurrent work was preserved; no full API type/release
  acceptance is claimed and no deployment authorized.

## Prioritized next work while retaining Free

1. Keep a **shared** CPU budget. Reduce about3.8CPU-minutes/day from the recent
   combined pace, with headroom. Review Ewa marketing and the other active
   projects alongside the API; do not allocate4hours independently to each.
2. Profile API initialization further: narrow/lazy email template exports so
   ordinary API imports do not initialize unused syntax-highlighter/rendering
   code; consider route-family lazy loading only with the existing auth, CORS,
   headers, errors and permission boundaries covered. The taxonomy profile is
   concurrent unpublished work and must be coordinated with its owner.
3. Reuse the already completed local request-context/query consolidation from
   the web-navigation work in a separately qualified release. Do not duplicate
   it, cache auth across requests, or claim it is live already. Public marketing
   render/cache work should be based on actual request evidence and preserve
   legal publication/withdrawal and private analytics/session freshness.
4. Use existing SQL-free `/api/live` for a liveness monitor if one is needed;
   keep DB readiness for deliberate checks. Do not introduce keep-warm polling
   to reduce the high cold-start percentage on this tiny recent sample. Current
   tracing sampling is0 in source; do not disable error reporting speculatively.
5. Continue the existing quiet daily provider review and1November Neon/Trigger
   reset review. Vercel rolling CPU requires usage aging out/reduction; a fresh
   database or new calendar month does not reset this account CPU history.

Brain updated: `.brain/features/api-infrastructure-efficiency.md`,
`.brain/api/contracts.md`, `.brain/tasks/done.md` and the local QA receipt.
