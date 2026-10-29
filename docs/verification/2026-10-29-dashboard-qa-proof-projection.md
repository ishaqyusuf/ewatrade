# QA-session proof projection —29October2026

Partial DP-003/103 under the [full program](../plans/2026-10-29-dashboard-performance-program.md).
Parent56e0bc50d plus owned hashes retained privately. Current primary checkout,
local implementation/testing only. No schema/migration, provider/policy setting,
credential extraction, deployment or business submission. Program3/27 (11.1%)
remains open beyond its accepted foundation tickets.

## Confirmed critical-path work and implementation

createTRPCContext validates QA-derived sessions after ordinary cookie/bearer
admission. validateQaDerivedSession read Session+authorization+grant, then the bound
Membership/Tenant/active Store. The valid path required2 sequential repository
calls. The real validator regression initially34 pass/2 failed on excess reads;
its33 policy cases already passed before this implementation.

An internal parameterized query now projects only QA binding IDs, authorization/
grant status, revocation/expiry/domain and exact membership matching in one fresh
statement. EXISTS preserves active Membership, exact Tenant, QA classification,
active/not-purging Tenant, matching source domain and exact active Store belonging
to that Tenant. No token, digest, metadata or ordinary session profile is selected.

The public validation function preserves missing/legacy handling, output scope,
managed-domain check, invalid-session delete and failure identity. It adds no cache,
trusted client field or permission exemption. Outer cookie/bearer/session expiry,
API strict Store/QA scope, ordinary/linked identities and locked command authority
are unchanged. One database snapshot avoids the prior split read; it never authorizes
a command using retained UI facts. Midday's users-on-team joined narrow query was
the reference; Prisma/DbClient and existing query/domain boundaries remain.

Optional PERFORMANCE_TRACE now distinguishes fixed numeric qaProofFacts and qaDomain
work inside sessionProof. Existing header/privacy parser accepts only these fixed
labels. This supports runtime path evidence and attribution without session IDs,
tokens, SQL text, parameters, domain strings or arbitrary labels. Default-off and
stream setup/full-completion distinction remain. Overlapping phases are not additive.

## Executed verification

- Actual validator36 tests/116 assertions passes.33 missing/legacy/binding/status/
  expiry/domain/Tenant/Store cases, invalid-session revocation, exact output,
  current rereads and database/policy/deletion error identity covered. Valid proof
  now1 bounded repository call rather than2. Run separately where module policy
  mocks could overlap other suites. No external identity/provider is invoked.
- Tracing/privacy plus validator44 tests/142 assertions pass across3 files.
  Fixed diagnostics exclude arbitrary/private labels and malformed metrics.
- One actual PostgreSQL SELECT executes all33 inert CTE cases using the exact
  source query. All six referenced relations are shadowed by typed CTE values;
  no real Session/grant/credential rows are read, and no records/schema are written
  or stored.33/33 binding/expiry/scope projections match. This is SQL predicate
  verification, not a database/page latency comparison. Script and result retained
  privately as qa-proof-sql*; no new permanent runner or dependency.
- Owned fast237 tests/1531 assertions across45 files, QA tooling types/Biome and
  full API production-entrypoint graph plus the owned proof test typecheck pass.
  A test expected-value nullability diagnostic was corrected without excluding it.
  Foreign explainers/Agent Chat excluded; no unknown mapping. H02 passes1 domain
  record,0 capability/procedure changes. API/router unchanged; current H01 reused.
  No newer optimized Dashboard build or native/device acceptance is claimed.
- Canonical existing-data local smoke passes with frozen source and optional
  performance artifacts. Catalog refresh5261ms; warm Catalog874ms/Overview1347ms;
  shell retained and zero blocked business writes. These are bounded development
  observations, not optimized budgets or a causal before/after comparison.
- A completed browser-visible API response reports qaProofFacts250ms/count1 and
  qaDomain0ms/count1 (rounded), proving the new helper executed without an API
  restart. Context3074.3ms contains auth2446.8ms; accumulated pool2218.9ms/count7
  and SQL1475.8ms/count7 identify remaining attribution work. Phases overlap and
  are not additive; a zero rounded policy duration does not omit its check.
  Missing SSR response phases are not zero. The copied canonical receipt still
  reports runtime unverified: path evidence is not committed build/release identity.
  Dashboard remains in development mode; no new runtime switch or speedup claim.

Private evidence: /tmp/ewatrade-dashboard-program-20261029/qa-proof-*.
The actual statement and tests cover its current scopes; no credentials or private
row values belong in tracked receipts. Caller-visible session and scope DTO unchanged.

## Remaining work and Brain impact

API session/proof/context latency, cookie-preference scope lookup, per-family
attribution and optimized budgets remain open. Fewer repository stages are verified;
no causal page-speed ratio, production saving or full DP-103 acceptance is claimed.

Brain BRAIN, performance/QA features, API contracts/permissions and in-progress
pointers updated locally. Existing request-local authority ADR covers this narrow
representation change. No schema/relationship/migration/API input/procedure/command
or provider policy changed; no migration/database push/new ADR is required.
