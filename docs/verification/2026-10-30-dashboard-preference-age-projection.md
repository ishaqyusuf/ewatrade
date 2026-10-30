# Dashboard remembered-business age projection —30 October 2026

Parent `b560bba77`. DP-103/201 shared read slice; full program3/27 accepted.
Local only. No deployment, service restart, account/grant/age mutation or provider
operation. Existing local API/Dashboard services are reused.

## Cause and change

The actual Hono → createTRPCContext → protected middleware path reproduces a
separate User-age read after remembered-business Membership admission. These are
different policies, but the first read can project the same actor's current age
through its User relation. Protected GETs can use that fact inside the existing
one-request DB/actor eligibility owner. One added indexed relation replaces a later
User statement; no new connection, transaction, shared cache or TTL.

The canonical age-band predicate is exported and reused unchanged. Eligibility is
evaluated lazily when a protected query asks, so public/account-recovery contexts
do not gain an early age gate. Undeclared age still throws the same precondition
before protected Tenant lookup. Same-GET query callers share the result/error;
foreign DBs/actors and new requests cannot reuse it. POST reads and mutations
keep the original preference-only select and fresh age lookup. Missing/revoked
preferences, explicit Tenant headers and contexts without that projection keep
the old age reader. Session/QA proof/legal signup/cookie admission still precede
projection; linked identity, byte-transport and canonical command authority remain.

This removes one query from the protected GET path, not from session context's
own preceding sequence. It does not solve the observed roughly630ms context by
itself or prove a210ms browser saving. Optimized latency acceptance remains open.

## Focused proof

- New actual-request regression is red on the parent: three matching contexts
  still issue redundant User reads; original fallback/POST/session cases pass.
- Six actual context/middleware cases, one generated-SQL/PostgreSQL case, six
  request-owner cases and three retained age-gate cases pass:16 tests/90 assertions.
  All four canonical age bands retain their existing outcomes. No teen/free-form
  or merchant/domain authority is inferred beyond the unchanged predicate.
- The actual captured preference arguments pass through the generated Prisma
  client with an inert driver: one joined statement. That exact SQL/bindings run
  in disposable PostgreSQL and preserve current age, Member status, active Tenant
  and actor ownership. No application database or live fixture is used.
- Lazy refusal, exact DB/actor owner, new requests, mutation rechecks, POST reads,
  explicit-header/fallback paths, missing/refused sessions, original error identity,
  strict/recovery Store refusal and independent reader copies pass.
- API production graph, owned fixture graph and full Dashboard types pass.
  Source parity proves the age module is only a predicate export/rename, and
  session/context outputs, protected/staff/QA/Tenant/command policy stay unchanged.
  The original test harness's nested Prisma spy did not intercept its proxy;
  corrected top-level reversible ports make every application DB call inert.
- Scoped fast checks pass:237 tests/1533 assertions plus QA tooling types and
  Biome. H01 coverage is current; H02 passes with zero capability/procedure
  changes. Canonical local smoke is recorded below.
  Foreign Agent Chat and staged explainers are excluded from owned checks.

## Scope and remaining acceptance

No schema/index/migration, public API/DTO, new tool/capability, legal policy or
permission grant. No UI redesign or new infrastructure. The prepared f027
Dashboard manifest hashes still match and exclude later source. A production build
or earlier optimized window does not validate this new projection's latency.

Private evidence under `/tmp/ewatrade-dashboard-program-20261029/`:
`preference-age-{red,tests,api-types,types,dashboard-types}.log` and
`preference-age-parity.json`. No request credentials or account records committed.

Brain impact: BRAIN index, task pointer, web-navigation-performance, API permissions
and existing request-local performance ADR updated locally. No schema/API-contract
update needed because only the existing read implementation changes.

## Frozen local browser check

Canonical existing-data local web smoke passed 2026-10-30T03:43:13.169Z–2026-10-30T03:43:40.939Z
with the parent commit plus pinned dirty hashes. All nine source/lock hashes match
afterward. QA sign-in/exact profile, populated Catalog, sale draft total and
cancellation pass; retained shell and zero blocked business writes. Source and docs
were frozen during the run. No sale/payment/age/grant command, fixture, service
restart, provider action or deployment. The named API/Dashboard doctor passed.

The observed Catalog API phase has legalReuse1, legal1 with0ms, SQL5, consistent
with the new first-caller projection reuse. This is one completed browser-visible
request and not complete SSR attribution. RuntimeVerified stays false. The exact
request/age/DB-owner proof comes from the actual-context and inert SQL checks.

Development observations: initial post-login shell7499ms, Catalog refresh3239ms,
first Catalog/Overview transitions1894/1167ms and warm1441/1109ms. Variable compile,
connection and local work make these unsuitable for a causal comparison. Context
for the observed Catalog request was2046.3ms, confirming the preceding sequence
still needs work; no optimized budget or whole-ticket closure is claimed.

Private `preference-age-{frozen,smoke-passed}.json`, `preference-age-smoke.log` and
`preference-age-runtime/performance.json` retain this one run. Earlier optimized
f027 manifests remain unchanged, with development mode retained throughout.
