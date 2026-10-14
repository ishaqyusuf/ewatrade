# S05 connected acceptance — smallest fixture proposal (12 October 2026)

Status: Part A authored; three root runs produced no connected evidence (latency dependency, see Run 3). Not rerunning. The frozen S05 source packet is
unchanged.
Requested by review 672c2170: guarded connected source comparisons,
browser/native original Open/Close/withheld/privacy/role/Store/finance
journeys, and a bounded-read performance check.

## Boundaries (apply to every step)

- Development only, through the existing guards: an explicit `.env.local`
  Development profile, `DATABASE_PROFILE_VERIFIED=1`,
  `RUN_DATABASE_INTEGRATION_TESTS=1`, the QA host and
  `assertQaAccessAcceptanceDatabase()`. Production is excluded by
  `applyDatabaseProfile`. No inferred profile.
- No provider, model, email or payment calls. No capability promotion: S05
  stays `planned`, and nothing sets rollout or process-only visibility in a
  running server. No API restart, push or deploy.
- Part A is the only part that writes. Every write happens inside one
  transaction that always throws a `Rollback` (the F01 pattern), so no row
  survives. Parts B and C are read-only against data that already exists.

## Part A — rolled-back source comparison and performance (source authored; not run)

Released for source authoring only (4db00f03). No database connection or
execution is released yet; the root coordinator serializes the connected QA
slot after source review.

Paths (S05-owned):
- `scripts/qa-staff-activity.mjs`. It is the `qa-collection-intents.mjs`
  launcher (explicit `.env.local` Development profile, Production exclusion,
  QA-host guard) plus a fail-closed check that the selected database is
  exactly the authorized `ewatrade_qa_v1` target (host and database name).
  It never prints the URL or credentials.
- `packages/db/src/queries/staff-activity.integration.test.ts`. It re-asserts
  the guard and `ewatrade_qa_v1` in-process.

Exact command (once released): `node scripts/qa-staff-activity.mjs`

Every case uses a fresh fixture in its own RepeatableRead transaction
(`maxWait: 10_000`, `timeout: 30_000`) that always throws the rollback
sentinel. Only that sentinel is caught; assertions, timeouts and other
errors propagate. Afterwards, read-only counts assert that the fixture's
Tenant and user IDs are absent. There is no persistent seed or cleanup, no
existing-account mutation and no nested root transaction.

Fixture:
- Two QA Tenants (`dataClassification: "QA"`): the main one, with Stores A/B,
  and a genuine foreign one.
- Users and memberships: Owner, Manager, Cashier, Amina, a departed user
  (membership deleted after recording) and a foreign Owner.
- Canonical records: orders created with `createCommercialOrderInTransaction`
  (Amina in A and in B, departed in A, foreign) and one payment recorded with
  `recordCommercialOrderPaymentInTransaction`.

Cases:
1. Source comparison.
   - Direct canonical reads use the loaders' exact predicates (Tenant,
     window, subject, Store). Full ordered identities, total and per-stream
     counts all match, including the subject filter.
   - The unseeded streams are asserted empty for the Tenant. Finance has no
     count without Books.
   - The departed actor is "unavailable" and never the viewer or another
     person.
   - The exact-ID re-read keeps the page order with no extras. A genuine
     foreign-Tenant order is withheld, and a foreign membership is
     NOT_FOUND.
2. Current authority within the transaction.
   - Manager with Store A scope: the Store B order is withheld, and the
     Store-A page equals the canonical Store-A rows.
   - Manager without a Store is refused; Cashier is refused.
   - Manager demoted, then suspended: refused.
3. Bounded reads (indicative).
   - 1,000 test-only orders via `createMany`.
   - 10 samples each of a 10-row page and a 10-ID re-read; p50/max and rows in
     the window are printed.
4. Query plans.
   - A separate client logs the exact statements Prisma sends for the ORDER
     and PAYMENT loaders.
   - `EXPLAIN (ANALYZE, BUFFERS)` runs on those statements with their bound
     values, inside the same rollback.

Stated limits:
- The public RepeatableRead wrappers and cross-transaction authority or
  concurrency are not exercised.
- Store and Book scopes are caller-derived at the API seam, so scope changes
  here are filter evidence, not grant revocation.
- Only orders and payments are seeded. Stock and price changes are omitted;
  finance has no Book, so no finance-filtering evidence (source-only tests
  remain).
- This connected subset cannot accept all 12 streams. Timings are indicative,
  with no SLA or production-size claim.

Source checks run without a database: `tsc` for the file is clean. Without
the guarded environment, all 4 cases skip. Run with an empty environment
root or a relative path, the launcher fails closed before connecting.

### Run 1 (root, 12 Oct, frozen 32c4b22c): 0 pass / 4 fail, slot released

| Case | Failure stage |
|---|---|
| Page | P2028, transaction not started within maxWait 10 s (10,180 ms) |
| Authority | Setup still running at `serviceOffering.upsert` (quick-sale bootstrap) when the 30 s transaction expired (49,172 ms reported) |
| Timing | P2028 at start (10,001 ms) |
| Plans | Bun 60 s deadline |

No plans or timings were produced. A read-only audit found no fixture
Tenant or user rows.

Diagnosis:
- Setup was row-by-row: about 20 sequential inserts plus four canonical
  order commands, each repeating the quick-sale catalog bootstrap. Over a
  remote round trip, that alone could exceed 30 s.
- There was no warm-up, so the first transaction start paid cold connection
  cost inside maxWait.
- A stuck or expired case could keep holding the shared client's connection,
  so the next case could not start.

Revision (refrozen for review; not run). The 10 s/30 s bounds are unchanged.
- A fixture-owned client (`max: 2`, `connectionTimeoutMillis` 10 s,
  client-side `query_timeout` 25 s) with a query counter. The shared product
  client is untouched.
- Each transaction starts with `SET LOCAL statement_timeout = '20s'` and
  `lock_timeout = '10s'`, so a stuck statement fails visibly.
- A bounded read-only preflight (`SELECT 1` connect plus 5 pings) is
  reported. If the median round trip is over 250 ms, it stops before any
  fixture with a clear message.
- Setup is batched: one `createMany` each for Tenants, users, memberships and
  Stores, then one canonical order (`createCommercialOrderInTransaction`) and
  one canonical payment (`recordCommercialOrderPaymentInTransaction`). The
  other orders (Amina in B, departed in A, foreign) go in one direct
  `createMany`.
  - The departed user is now a user with no membership or profile in this
    business, which is the same state as after removal.
  - The page comparison is unchanged in meaning: loader output against direct
    canonical reads with identical predicates.
- Fixture IDs are planned before the transaction. The read-only absence check
  runs after every case, including failures.
- Each case reports a JSON line: stage, setupMs, setupQueries, total queries,
  caseMs, outcome and absent.
- Cases are split into five (page; subject/shown/foreign; authority; timing;
  plans), each with a fresh fixture and a 50 s Bun deadline
  (10 s wait + 30 s transaction + absence check).
- Timing uses a fixed 5 s budget per measurement (minimum 1, maximum 10
  samples) and reports the actual count.

### Run 2 (root, 12 Oct, frozen 21266aed): preflight refused, slot released

Preflight measured: connect 9,413 ms, ping median 426 ms, max 2,827 ms. The
250 ms gate stopped the suite before any transaction or write. All cases are
unrun. This is non-acceptance, not a product defect.

### Revision 3 (refrozen for review; not run)

Statement inventory, counted from source:
- Each read: viewer 1, Store check 1, subject 1, loader 2 per stream (rows +
  count), projection ≤ 3. A one-stream page is about 6 statements; the
  all-streams page about 26; a two-stream exact-ID re-read about 8.
- Transaction overhead about 5. Direct seed 6 (four people/Store batches plus
  orders and payments). The canonical seed is estimated at 30, an assumption
  to be replaced by the measured `setupStatements`.

Budget gate: before any transaction, a case runs only if estimate × measured
median ≤ 20 s (10 s of the 30 s left for outliers). Otherwise it fails as
"Unrun" with no writes. The fixed 250 ms gate is removed.

Projected at the measured 426 ms median:

| Case | Statements | Projected |
|---|---|---|
| Canonical baseline (command-made order and payment, exact-ID read) | 43 | 18.3 s |
| Order and payment pages against direct rows; departed/foreign | 25 | 10.7 s |
| Subject, exact-ID re-read, foreign | 29 | 12.4 s |
| Authority (Store, Cashier, demote, suspend) | 26 | 11.1 s |
| All-stream sweep (unseeded streams 0, totals) | 39 | 16.6 s |
| Timing (1,000 orders, 2 × 2 s budgets) | 18 + 10.8 s | 18.5 s |
| Plans (actual loader SQL, EXPLAIN ANALYZE) | 29 | 12.4 s |

Other changes:
- One warm connection (`max: 1`, `idleTimeoutMillis: 0`,
  `connectionTimeoutMillis` 20 s for the measured 9.4 s cold connect). The
  client query timeout and the transaction-local statement/lock timeouts are
  kept.
- Every case except the canonical baseline seeds synthetic rows directly.
  These are disclosed as source-query controls.
- ORDER/PAYMENT comparisons are isolated from the all-stream sweep.
- Per case, measured `setupStatements` and `readStatements` are reported.

If the endpoint is slower on the day, the affected cases stop as unrun
rather than retrying or loosening limits. Full 12-stream acceptance remains
open either way.

### Run 3 (root, 12 Oct, frozen 282ee45e): all 7 cases unrun, slot released

- Exit 1: 0 pass / 7 "fail", 21.61 s. Every case was a pre-transaction budget
  refusal, not a failed assertion.
- Preflight: connect 8,543 ms; pings [723, 1,884, 2,503, 2,979, 4,454] ms
  (median 2,503 ms, versus 426 ms in run 2).
- Projected budgets ranged from 62.6 s to 107.6 s, all over 20 s.
- `assertFits` runs before IDs are planned and before `$transaction`, so no
  transaction or write began. All 28 fingerprints were unchanged.

### Consolidated connected dependency (stop condition reached)

Three runs produced no connected S05 evidence:
- Run 1: transaction start and setup expiry.
- Runs 2 and 3: latency refusals.

Round trips to the authorized `ewatrade_qa_v1` pooler endpoint from this
machine measured 426 ms, then 2,503 ms, and connects took 8.5–9.4 s. That
establishes a present latency dependency, not its cause, and not a product
performance defect.

Per coordinator review 60d065ca:
- The suite is not rerun on this evidence.
- Thresholds are not revised again, and the 10 s/30 s bounds and exact-target
  guards stay.
- A new frozen fixture does not schedule a run.

What would unblock it (owner/coordinator decisions, not taken here):
- Rerun from a host or network with a stable low round trip to the same
  authorized target. The fixture is unchanged, and the budget gate already
  refuses unsafe conditions.
- Or the diagnostic below, to tell network from endpoint first.

### Optional bounded diagnostic (proposal only; needs coordinator review)

Goal: tell local network, TLS/pooler handshake and database execution apart,
with no product edits and no fixture writes.
1. DNS resolution time for the authorized host, 3 samples. No connection.
2. TCP connect time to host:5432 without TLS or authentication (open and
   close), 5 samples.
3. A full authenticated connect plus 5 × `SELECT 1` client round trips, as in
   the existing preflight, against the same target and guards.
4. Server-side execution time from `EXPLAIN (ANALYZE) SELECT 1` and
   `SELECT now()` in the same session, showing whether the server is idle and
   the time is spent in transit.

Reading the results (observations, not root causes): see the interpretation
under "Latency diagnostic source" below.

This would be one script under `scripts/` (path to be requested), read-only,
printing only timings and never the URL.

### Latency diagnostic source (released for authoring only, 12 Oct; not run)

Script: `scripts/qa-staff-activity-latency.mjs`. Connecting needs an explicit
`--run`; `--self-test` checks the guard with synthetic credentials and no
network.

Command, once root schedules it:
`node scripts/qa-staff-activity-latency.mjs --run`

Guard, which is a pure function run before any DNS/TCP/authenticated work:
- explicit `.env.local` Development profile;
- the shared `applyDatabaseProfile` Production exclusion (reference URL
  required; equal target refused);
- exactly the authorized host and `/ewatrade_qa_v1`.

Self-test cases, all passing: accepted target; missing profile; production
profile; Production-equivalent target; missing Production reference; other
Development host; other database; unsafe error text reduced to a code.
Argument refusals (no flag, a relative root, an empty environment root) stop
before connecting.

Phases and deadlines. Each deadline cancels the underlying work, not just a
race.

| Phase | Work | Deadline and cancellation |
|---|---|---|
| DNS | 3 × `resolve4` | 2 s each; `Resolver.cancel()` |
| TCP | 5 × unauthenticated connect to the first A record:5432 | 2 s each; `socket.destroy()` on connect, error or deadline |
| Connect | 1 authenticated `pg.Client` | `connectionTimeoutMillis` 15 s, plus a 15.5 s deadline that destroys the stream |
| Ping | 5 × `SELECT 1` | `query_timeout` 2 s, plus a 2.5 s deadline that destroys the stream |
| Server plans | `EXPLAIN (ANALYZE, FORMAT JSON)` of `SELECT 1` and `SELECT now()` | 3 s each |
| Cleanup | `client.end()` | 3 s, else the stream is destroyed |
| Whole process | — | 58 s ceiling: destroys resolver, socket and stream, prints, exits 2 |

- After the first failure in a phase, later phases are UNRUN.
- Output is a single JSON report: per-phase attempted/completed counts,
  sample timings, status, sanitized `errorCode`, and server
  planning/execution times. No URL, credentials, headers or row values.
- Only fixed statements are sent: no business tables, writes, DDL, locks,
  explicit transactions or provider calls, and no retries.

Interpretation, per review 3c8811fd: results are observations. A slow TCP
handshake with tiny server execution time suggests a path or connection
contributor, but does not identify the root cause or exclude TLS, pooler
queueing, client overhead or server timing scope. TCP to 5432 alone does not
measure authenticated TLS or pooler performance. A fast diagnostic neither
grants S05 acceptance nor triggers another fixture run.

### Latency diagnostic repairs (review 46ac8cb6; refrozen, not run)

1. Effective target. `pg` honours query-string `host`/`port`, so the guard
   now:
   - refuses any query parameter except `sslmode` and `channel_binding`;
   - parses the URL with pg's own `pg-connection-string`;
   - requires PostgreSQL, host = authorized, port 5432 (an absent port parses
     as "", meaning 5432) and database `ewatrade_qa_v1`, on both the URL and
     the effective config;
   - repeats the Production comparison after these checks.
   TCP and authentication both use 5432.
2. The first failure in any phase ends the run (an internal stop is thrown
   into cleanup). Every later phase stays UNRUN with 0 attempts, and no
   client is constructed after a DNS or TCP failure.
3. `attempted` starts at 0 and is incremented before each started attempt;
   `planned` is kept separately.
   - On the process deadline, the running phase is finalized as
     `deadline`/`PROCESS_DEADLINE`, and later cancellation errors do not
     overwrite it.
   - Zero server timings are reported as 0, not null.

Dependencies (resolver, socket, client, timers, exit, log) are injected, and
the self-test uses in-memory stubs only (no DNS, sockets or clients, not even
on loopback). Self-test: 25/25 pass, network none.
- Guard (16 cases): accepted target; explicit 5432 accepted; missing profile;
  production profile; Production-equivalent; missing Production reference;
  other host; other database; `host=`, `hostaddr=`, `port=`, `dbname=` and
  `options=` overrides; non-5432 URL port; non-PostgreSQL protocol; unsafe
  error text reduced to a code.
- Phases (9 cases): success runs only the 7 fixed statements, with one
  client, one end and every socket destroyed; zero timing is 0; DNS sample 2
  failure stops everything (dns attempted 2, nothing after); first TCP
  failure stops before any client; DNS deadline calls `Resolver.cancel`; TCP
  deadline destroys the socket; connect deadline destroys the stream, cleanup
  still ends the client and ping stays UNRUN; hung cleanup is bounded and
  destroys the stream; the process deadline destroys active work, finalizes
  the phase, logs `process_deadline` and exits 2.

### Latency diagnostic repair 2 (review 6c7ce24b; refrozen, not run)

With no port in the URL, `pg.Client` falls back to the ambient `PGPORT`. The
guard now returns the validated URL with an explicit `:5432`, re-parses that
pinned URL with pg's parser, and repeats the Production comparison on it.

Self-test: 27/27 pass, network none, including two new cases. With
`PGPORT=5433` set (and restored afterwards), clients constructed from both
the bare and the explicit-5432 URLs report port 5432, the authorized host
and `ewatrade_qa_v1`, without connecting; PGPORT is restored afterwards. The
suite also passes when run under an unrelated ambient `PGPORT=6000`.
Negative control: an unpinned URL under `PGPORT=5433` gives `port 5433`.

### Latency diagnostic run (root, 12 Oct, 24f03d8fe654): completed, slot released

| Phase | Samples | Result |
|---|---|---|
| DNS | 3/3 | 136.8, 4.6, 3.8 ms |
| TCP | 5/5 | median 207.6 ms |
| Authenticated connect | 1 | 2,336.3 ms |
| `SELECT 1` | 5/5 | median 206.9 ms |
| Server plans | 2 | about 0.02 ms planning and execution each |

Observation only: round trips were about 207 ms, much more than the
constant-query server work, versus the 426 ms and 2,503 ms medians in the
S05 preflights. This suggests path, connection or client overhead. It does
not identify a cause, prove future stability or validate fixture budgets.
No S05 retry follows from it.

## Part B — browser journeys (read-only; needs owner decisions first)

No assistant answer is needed and the capability stays planned. The dashboard
sheet opens from its URL param: build `staffActivity=<target JSON>` from a
real page read of an existing QA business, then load it.

Per-role journeys use existing QA users already holding the roles (Owner,
Manager of one Store, Cashier), switching sign-in only:
- Open, Close, withheld rows.
- "Switch to <Store>" for another Store.
- Finance shown as "Open from Finance".
- Cashier refused.
- A pending close/reopen in the browser, with network throttling.

Prerequisites I cannot do myself:
- A running local API on the current source. Memory notes 3095 may be stale
  and only the owner restarts it; E05 restart is unapproved.
- Confirming which existing QA business and users may be read.
- G01 connected QA is human-paused. Part B starts only if the owner lifts
  that pause for this read-only scope.

## Part C — native journeys (read-only; same prerequisites)

- Deep-link `/staff-activity-modal?target=…` in the simulator with the same
  QA users.
- Order and Product Open in the same Store.
- Cross-Store order shows "Switch to …"; stock, service and finance kinds
  point to the dashboard.
- A withheld row after signing in as the Manager of the other Store.

Privacy journeys (account deletion/restriction while a target is open) need
a persistent mutation of a QA account. They are not proposed here and need a
separate owner-approved plan with a restore step.

## Still incomplete regardless of this evidence

- Cross-Store original navigation.
- Native stock, service and finance originals.
- A dashboard journal-entry original.
