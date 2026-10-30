# Finance snapshot authority and Book projection —30October2026

DP-003/103/405 source slice under the full27-ticket Dashboard program. Parent
fea718366b368dccdee0db96339b02a6f71b3b35 plus frozen owned inputs/lock. Local only;
program remains4/27(14.8%), all59 routes/nine families and all23 open criteria.

## Cause and correction

The actual protected callers for balances/owed first select snapshot authority,
then the Book. Bills uses the generic separate lock/authority then Book. All three
already own RepeatableRead, maxWait10s/timeout30s. Actual caller red observes2/2/3
body statements against expected1. No application DB is involved in that red.

The existing snapshot module now exposes one bounded authority/Book read. It locks
Membership only, joins its Tenant, then left-joins at most one scoped Book and
selects id/currency/sequence/start date. One shared unchanged permission predicate
runs before the existing Book NOT_FOUND error. Explicit Book keeps tenant binding
and permits an older-currency Book; current-currency mode requires the request,
current Tenant currency and selected Book currency to agree. Values are bound.
Membership and Book uniqueness bound this join to one result, without new indexes.

Only the three existing RepeatableRead readers use it. Their money projections,
filtering/counts/sort/cursor/receipts/DTOs and transaction options stay unchanged.
Other readers, generic assertFinanceManager, Book's separate post-lock path and
all financial commands remain. Do not reuse this joined statement under arbitrary
ReadCommitted ownership or change isolation to make it applicable.

## Focused source and native proof

- Actual API/money/role/plan17/73 pass, including one admission/Book statement,
  bound current currency, server actor/tenant and rejection before unsupported work.
- Actual generated Prisma/PostgreSQL14/319 pass on the explicit disposable Unix
  socket. Native SELECT counts2→1 for snapshot authority/Book and3→1 for the former
  Bills guard/Book path. Date,9007199254740993 sequence and current/explicit currency
  parity, missing/foreign Book,56 authority decisions and error ordering covered.
- Real two-session waits preserve the same Tenant currency/Book sequence snapshot
  as both original guards. Next transaction observes changed currency/sequence.
  Concurrent Membership revocation yields40001; next read is forbidden. Commit/
  rollback hold Membership SHARE and add no Tenant/Book row lock. Existing actual
  ReadCommitted negative control still proves why default Book/commands stay apart.
- Actual Bills reader preserves large exact amounts, aggregate/count scope,
  page/continuation bounds, attached receipt counts and NO_RECEIPT selection.
- Actual balance/owed projection and Bills source cases19/293 pass. Money SQL and
  arithmetic are unchanged; only fake admission ports adapt to the joined row.
- Owned native fixture databases removed: count0. Owned socket-only cluster stopped.
  No application database, app fixture, money posting, migration or provider write.

- Owned DB/native/projection types, API production/owned test and complete Dashboard
  types pass. A native-fixture guard parameter needed an explicit compatible type;
  its runtime behavior is unchanged. Native runtime proof is reused after that
  annotation/format-only correction. Optimized Next16.4.3 build/types pass.
- Explicit ten-path fast smoke passes237/1533 across45 files plus QA types/Biome,
  zero unknown mappings; foreign Agent Chat/staged explainers excluded. H01 current
  coverage is byte-unchanged; H02 passes domain-only, zero capability/procedure deltas.
- Compiler-AST comparison proves all three post-Book bodies and transaction options,
  four other exported functions, old snapshot query and shared permission predicate/
  result unchanged. Generic guard, Book/accounts path, scope helper, router/schema,
  finance model and capability coverage remain byte-identical to parent.

## Focused optimized observation

Next16.4.3 artifact lk0TyEwhp1z7MyhmRFYem contains frozen ten source/test/impact
paths and lock. Three runner inputs are frozen separately after the app build;
they do not change product build inputs. All source/runner/lock and three build
manifests match through the passed canonical run16:05:25.279Z–16:06:06.324Z.

The existing smoke runner now supports QA_WEB_FINANCE_OVERVIEW=true. It reuses
ordinary QA login/Catalog/draft-total/Cancel, then Finance refresh/return with all
three panels ready and the same two isolated GETs. Full-family and existing focused
modes retain precedence. The actual inert browser driver35 cases passes, including
focused Finance readiness, missing-content refusal and canonical-local/artifact
guards. QA-only fast scope47/195 across4 files plus QA types/Biome passes. No new
runner, fixture builder or application write is introduced; docs/testing updated.

| Finance representative | Prior full-family aXG sample | Current focused lk0 sample |
| --- | ---: | ---: |
| Refresh |3326ms |2898ms |
| Warm return |2339ms |2342ms |

Same representative readiness, but different preceding family sequence and only
one pair. No p95, accepted budget or controlled whole-page gain is claimed. Warm
return remains unresolved. Its window starts7 Flight requests (4 prefetch/3 route
navigation) and no browser API/RPC requests. Server-to-server reads remain unseen;
this points the next warm-return attribution to the actual server route/Book owner,
not another assumed browser panel-query bottleneck. Source still awaits a fresh
protected Book before returning Finance composition on soft navigation.

| Isolated GET | Elapsed | SQL | Context | Transaction control | Decoded body |
| --- | ---: | ---: | ---: | ---: | ---: |
| finance.book |1560ms |7 |654.6ms |448.3ms/2 |9149bytes |
| finance.owedSummary |1740ms |8 |636.2ms |643.6ms/3 |557bytes |

Previous owed1905ms/9SQL/557bytes; current8SQL agrees with native one-statement
reduction. Book remains7SQL/9149bytes. Pool0–0.1ms, legal/domain0–0.1ms. Phases
overlap and are not additive page latency/pure network RTT. Runtime API revision
is not fully certified; the canonical receipt remains runtimeVerified:false.
Other-family aXG evidence is reused for unchanged relevant source, with unchanged
authority/body proofs above; this is not a new nine-family or lifecycle run on lk0.

## Restoration and remaining scope

Dashboard77855development→approved optimized launcher33154→80851development via
root bun run dev --local -f dashboard, launcher24532. API48226, Storefront46668,
Marketing90981 unchanged. Trusted-CA SQL-free doctor passes before/after; generated
next-env restored. No API restart, push/merge/deployment, provider action or app DB
fixture/money submission. Owned disposable cluster is stopped and DB count0.

Brain BRAIN/task/QA/navigation, Merchant Finance, API contracts/permissions and
existing snapshot-owner ADR updated locally. No app schema/index/migration change
or migration/push command applies. All23 open criteria remain verbatim. Next actual
server-side Finance return attribution, Activity/other family owners, remaining
lifecycle/invalidation/delivery/interaction and full original program acceptance.
Private finance-snapshot-book-* evidence stays under
/tmp/ewatrade-dashboard-program-20261029, including failed type output and corrected
type/annotation parity, green/native/driver/build/gate logs, passed receipt, hashes
and restoration. No credentials, live SQL/parameters, private actors or bodies.

## Midday conformance

Inspected Midday bank-account query ownership and API/DB/jobs standard. Query logic
stays in the existing Finance DB module; protected router/schema/client contracts
are untouched. Prisma parameterized SQL follows this project's accepted snapshot
ADR and actual EwaTrade money/lock authority. No UI/table/sheet/form/URL migration,
job, dependency, schema or API expansion applies to this read projection.
