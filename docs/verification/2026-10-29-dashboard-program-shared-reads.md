# Dashboard program: first shared-read milestone

29 October2026. [Full27-ticket scope](../plans/2026-10-29-dashboard-performance-program.md)
remains active. DP-001/002/101 complete3/27 (11.1%); other tickets remain open.
Current primary checkout, local only. No push/deployment, new fixtures, model call
or business submission. Foreign staged explainers and other owners' work preserved.

## Source and runtime

- `41f38ee1c`: all27 requirements and exact59-route inventory committed.
- `7e3f10ea5`: existing opt-in tracing gains fixed numeric phase/count headers.
- `1c7713ec9`: protected GET query read facts shared within the one HTTP lifetime;
  Inventory's unconsumed Catalog prefetch removed, broader DP-102 audit still open.

Existing root launcher starts only the approved local API with PERFORMANCE_TRACE=true;
managed session18061, private log `api-trace-dev.log`. Other services remain running.
Existing local profile isolation check passes. `/live` returns new fixed phase headers;
actual protected query requests emit scopeReuse hits, demonstrating active changed
code. No .env/provider/security setting changed. The flag is for temporary local
diagnostics and needs returning to normal when measurement work is finished.

Canonical private receipt:
`.scratch/qa-release/smoke-1c7713ec964f960211ee0b26a82691980eeadb04-local-web.json`:
passed existing QA login, populated Catalog, sale draft total and cancellation.
No business submission. `runtimeVerified=false` is retained: local evidence cannot
qualify a deployment/release. The earlier shared Storefront compile blocker is
cleared for this candidate. Optimized-runtime measurement remains DP-003/503.

## Changed boundaries

One HTTP GET owns in-flight legal eligibility and Tenant/Store lookup promises.
Database identity, user, requested business and Store separate facts; each RPC gets
an independent copy. Real protected and protected-or-internal callers share them.
Strict scoped Store refusal cannot be satisfied by recovery facts. QA scope and
purge checks remain per caller. POST reads, mutations, linked identities and default
byte resolvers retain fresh reads. There is no global authorization cache or TTL.

Existing request-local Dashboard session/context and plan projection are retained;
cookie preference admission and Tenant resolution remain distinct policy reads.
The GET memo removes duplicate multi-caller work rather than skipping those policies.
Two existing age-gate fixtures were corrected to include the session envelope the
unchanged browser-identity guard requires, so they reach their intended age/QA tests.

Instrumentation remains behind existing PERFORMANCE_TRACE. Fixed numeric phase,
count and duration values exclude SQL, parameters, actors, payloads, errors and
arbitrary labels. Phase durations overlap; accumulated SQL time can exceed request
wall time. Reuse counters distinguish avoided reads without retaining identities.

## Executed checks

- Offline doctor passes; source smoke scope inspected. Whole-checkout unmapped
  concurrent AI paths were disclosed; final fast checks use explicit owned paths.
- Tracing/request-ID9 tests29 assertions pass; GET/scope/legal/plan/QA/tenant plus
  tracing26/76 pass, including real parallel procedure callers. Suites overlap.
- API production source types pass using its existing config with test roots
  excluded. Full API fixture errors from the preceding receipt are not claimed fixed.
- Dashboard full types pass. Owned fast source237 tests1531 assertions pass.
- H01 current after APP_ENV=local regeneration; resulting COVERAGE matches HEAD,
  so no foreign/generated coverage change is included. H02 passes4 records with
  no capability and4 procedure row changes across the wider comparison, including
  concurrent committed features. Own program record covers no capability/procedure.
- Actual IAB core navigation and Inventory existing-item detail open/refresh pass.
  Read-scope key/Tenant tests5/39 pass. Canonical local smoke passes on1c7713ec9.

The real multi-caller regression was red at3 legal/3 Tenant reads, green at1 each.
Separate requests/readers/database objects, query-local result mutation, QA mismatch,
POST reads, mutation revocation and strict-versus-recovery cases remain isolated.
No source guard or failed check was bypassed.

## Observations, not program acceptance

One early QA request4038ms spent3371ms in context, including auth1873ms, QA proof
1281ms and scope445ms. Later observed context requests remained substantial; QA
proof overhead does not describe all production sessions. Existing API tracing and
SQL counts now make the next hypotheses testable.

Two same-session warm core rounds before the GET change ended at Catalog985ms/
Overview1474ms; after source change950/1381ms. Earlier rounds had compilation/HMR
effects (including6476ms after edit). These small samples do not establish a causal
latency win. Actual runtime query batches show scope reuse hits of2 and8; API log
windows can contain background/concurrent traffic, so no per-route SQL attribution
is inferred from those windows alone.

Inventory's existing Notebook detail opens3479ms/refreshes6860ms after removal of
the unused prefetch. It still exceeds the target. A separate header-only Inventory
sample was2498ms with summary/table still loading and is not useful-content timing.
An initial Catalog timing spanning tool calls was discarded because it included
agent latency. No tail percentile, bundle reduction or production speedup is claimed.

## Remaining work and memory

DP-003 needs complete bounded family baselines and optimized-runtime comparison.
DP-102 needs every remaining prefetch/input/key consumer audit. The full remaining
24 tickets and final acceptance budgets are preserved in the program. Earlier
Catalog correction's shared compile/gate blocker is superseded by this smoke/gate
receipt; its unachieved fresh-read latency targets remain open in the new program.

Updated local Brain: web-navigation-performance feature, API contracts/permissions,
system architecture, BRAIN index, in-progress/done task records and this milestone's
QA pointer. Brain stays ignored by policy; tracked plan and receipt retain reviewable
scope and evidence. Private artifacts/source hashes live in
`/tmp/ewatrade-dashboard-program-20261029/`; credentials and QA config stay private.
