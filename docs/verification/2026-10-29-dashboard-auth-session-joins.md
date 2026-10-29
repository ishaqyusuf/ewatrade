# Auth session joined reads —29October2026

Partial DP-103 under the [full program](../plans/2026-10-29-dashboard-performance-program.md).
Parentafeb98f5 plus owned hashes retained privately. Primary checkout, local only;
no deployment, schema/dependency/provider change or business submission. Program
3/27 (11.1%) remains unchanged; this does not accept an entire family or DP-103.

## Root cause and conformance

The installed Better Auth1.6.23 SDK asks for Session plus User. With joins disabled,
its adapter factory falls back to two sequential repository reads. The actual
application initAuth/getSession loop reproduced this:7 passing policy checks and
4 excess-read failures before enabling the option. An initial expected Prisma
where shape was corrected to the SDK's existing equals form; that fixture issue
is separate from the four performance failures.

The auth package now enables experimental.joins, the setting supported by the
installed1.6 adapter and [versioned official docs](https://better-auth.com/docs/1.6/adapters/prisma).
Current unversioned documentation names a newer setting; no SDK upgrade or option
from that version is assumed. Existing generated Prisma relationJoins support and
Session.user, Account.user and User.accounts names are retained. Midday's API keeps
admission with its auth SDK and measures context work; its JWT/Supabase authority
is intentionally not copied into EwaTrade's cookie/bearer/QA proof model.

One joined repository read replaces two for a valid signed cookie. The SDK still
owns signatures, current session/user parsing, expiry, due refresh and deletion.
Cookie cache stays disabled; there is no custom cookie parser or retained identity.
Session creation still runs privacy then legal policy before any write. Existing
API cookie-first/bearer fallback, QA proof, legal, Tenant/Store, linked identity and
locked command checks are unchanged. The joined Account and batch Session paths
are covered because this option applies beyond getSession.

## Executed verification

- Real application config, Better Auth SDK and Prisma adapter run against inert
  repository/policy boundaries:12 tests/46 assertions pass. Signed current cookie,
  malformed/missing/bad signature, missing/expired/revoked session, missing user,
  current user reread, QA token preservation, refresh, delete and SDK read-error
  rejection pass. Internal batch/account relation behavior and creation privacy/
  legal refusals/order are covered. No connected user/token/fixture is used.
- One actual PostgreSQL query through the real application auth config, SDK,
  generated Prisma client and instrumented adapter validates the Session/User
  relation shape. It uses a signed random inert nonexistent token and returns no
  session:1 SQL statement,0 rows,0 stored fixtures/writes/real credentials read.
  This proves query compatibility, not valid-session connected policy parity or
  a latency ratio. The inert policy regression owns that separate coverage.
- Owned fast237 tests/1533 assertions across45 files, QA tooling types/Biome and
  full API production-entrypoint plus owned auth-test graph typecheck pass. Auth
  was previously unmapped by test:quick: plan failed visibly, then its shared-client
  mapping was reviewed/added with an existing workflow regression. No unsupported
  mapping was ignored; foreign explainers/Agent Chat excluded. SDK tests run
  separately to contain repository module mocks.
- Assistant H02 passes1 record,0 capability/procedure deltas. Canonical existing-data
  web smoke passes with frozen source. Initial sandboxed attempt ended before any
  page/check/artifact; the same authorized command with native browser permissions
  passes. Development Catalog refresh4128ms; warm Catalog899ms/Overview1087ms;
  shell retained and zero blocked business writes. Inspected Overview screenshot
  shows the existing ready summary/orders/setup/storefront content.
- One completed visible API response reports auth1478.6ms, context2380.1ms,
  qaProofFacts589.2ms/count1, accumulated pool1760.6ms/count6 and SQL1236.8ms/count6.
  The previous sample had7 acquisitions/statements, consistent with the removed
  repository read, but pool conditions differ and phases overlap. This is not
  a controlled causal speedup or a p95. Missing SSR timing is not zero. Canonical
  receipt remains runtime unverified; development mode remains active with no
  new runtime switch or service restart.

Private evidence: /tmp/ewatrade-dashboard-program-20261029/auth-join-*.
Existing H01 public API/router snapshot evidence is reused: no route/procedure or
assistant business capability changes. No newer optimized Dashboard acceptance,
native/provider/sign-in delivery or production performance claim is made.

## Remaining acceptance and Brain impact

Database acquisition/queue/connection attribution, remaining context work and
optimized per-family budgets stay open. Do not sum overlapping auth/context/pool/
SQL phases or infer p95 from a bounded development sample. No pool/idle/max tuning,
policy cache or provider budget change was made.

Brain BRAIN, performance/QA features, API contracts/permissions and in-progress
pointers updated locally. Existing request-local authority ADR applies; no new
schema/relationship/migration, API input, procedure or command decision requires
migration, database push or another ADR.
