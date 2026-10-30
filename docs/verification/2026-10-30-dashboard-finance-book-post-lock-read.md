# Finance Book post-lock projection and current Dashboard sample —30 October2026

DP-003/103/405 source slice under the [full27-ticket Dashboard program](../plans/2026-10-29-dashboard-performance-program.md).
Parent `4e6d9ce40` plus frozen six source/test/impact inputs and lock. Program
remains **4/27 (14.8%)**, all59 routes/nine families; no new ticket or separate
Finance-roadmap acceptance. Local implementation/testing only, no deployment.

## Cause and correction

The actual finance.book API caller performs three body reads: Membership SHARE
lock, fresh permission/Tenant facts, then current-currency Book/accounts. Recorded
Book8-SQL requests include context and transaction control as well. The real-caller
red test expects two body reads and observes three; no live DB is used in that test.

The API now supplies its server-derived workspace currency as an internal lookup
hint. After the same **separate lock succeeds**, a generated Prisma joined query
reads current active Owner/Admin/Tenant facts and at most one matching Book with
accounts ordered by code. The nested Book relation also requires its Tenant's
current currency to equal the hint. A mismatch projects no hinted Book, then uses
the original lookup for the freshly observed currency. Hints confer no authority
and are not new public input. No hint follows the original guard/body unchanged.

Do not replace the first lock and post-lock facts with one joined lock statement:
under ReadCommitted a waiting statement can retain earlier Tenant facts. This
change retains that separation and existing transaction defaults/maxWait10s/
timeout30s. Generic assertFinanceManager, all commands/locks, snapshot readers,
Finance plan/role middleware, error mapping and public DTO remain unchanged.
Nine other functions in accounts.ts and the no-hint body/options have compiler-AST
parity. No schema, migration, index, dependency, cache or freshness-window change.

## Focused verification

- Actual API Book caller proves3→2 body reads, lock parameters, server-derived
  current currency, bounded joined selection and exact large sequence string.
  Existing current-Book/schema/money-read and role/plan cases pass: **14/64**.
- Actual generated Prisma executes on an opt-in, socket-only disposable PostgreSQL
  fixture. Final **7/141** checks full SDK Book/account DTO parity, Date/enum/array
  decoding and ordering, exact9007199254740993 sequence, matching3→2 SELECT count,
  arbitrary/mismatched hints, missing Book and56 role/status/business combinations.
- Two actual readers blocked on Membership observe the committed currency change
  with current-currency fallback, or reject committed Member revocation. The new
  helper retains Membership SHARE through commit and rollback. Existing unchanged
  snapshot/ReadCommitted control suite passes9/152 in the same isolated cluster;
  its earlier counterexample remains authoritative. No transaction shortcut.
- First native fixture run used the wrong bank-payment enum; its seed/expectation
  were corrected to BANK_TRANSFER, then all new cases passed. No product behavior
  or assertion was weakened. Random fixture databases removed: count0. The owned
  cluster is stopped. No application DB, business fixture, command or grant write.
- Owned DB/native, API-production/owned-test and complete Dashboard types pass.
  Explicit six-path fast plan/check passes **237/1533 across45 files**, QA tooling
  types/Biome, zero unknown mappings. Foreign Agent Chat/staged explainers excluded.
- H01 checked with the development router mode; coverage is current and byte-
  unchanged. An initial wrong-mode generation was restored to its previously
  clean bytes before that check. Reviewed H02 passes api/domain, zero capability/
  procedure deltas. No new assistant authority or delivery promotion.

## Matching optimized local observation

Next16.4.3 build **3igQPtYkK9g1-qAFS_m5o** passes, including final build types.
It includes the previously committed creation/Finance/Ledger/Order refresh slices
and current frozen backend inputs. Generated next-env returns to its exact prior
development bytes. Source/lock and 3 build-artifact hashes match through
the full canonical run. Dashboard-only switch uses the prior owner approval.

Canonical local smoke passes **15:09:50.832Z–15:11:05.951Z**: existing QA login,
Catalog, draft item/total, untouched Cancel,18 representative readiness/shell checks
across nine families and two isolated Finance GETs outside page windows. No fixture
or business submission. Receipt retains runtimeVerified:false; complete hot API
revision is uncertified. The observed SQL count agrees with the new Book path.

| Representative | Refresh | Warm return |
| --- | ---: | ---: |
| Overview |964ms |1059ms |
| Catalog |2799ms |821ms |
| Orders |1975ms |823ms |
| Customers |1184ms |1332ms |
| Finance |3271ms |2343ms |
| Website requests |2341ms |827ms |
| Activity |2299ms |2629ms |
| General |1198ms |1332ms |
| Reports |2288ms |819ms |

Single samples, not p95, accepted budgets or a causal speedup. Finance warm2343ms
and Activity2629ms remain near the preceding2345/2623ms observations. Catalog's
refresh2799ms is slower than1412ms previously; do not hide it or attribute it to
the Book change without further evidence. Its document first headers shift19.3→
1948.8ms, while both windows start79 requests,44 scripts and the same five RPC
operations; script bytes754282→754231. This points the next investigation toward
pre-header/server work and variability, not an established bundle expansion or
extra browser-query waterfall. Server-to-server work remains unseen.

| Isolated GET | Elapsed | SQL | Context | Transaction control | Decoded body |
| --- | ---: | ---: | ---: | ---: | ---: |
| finance.book |1645ms |7 |749.7ms |438.6ms/2 |9149bytes |
| finance.owedSummary |2000ms |9 |654.3ms |657.3ms/3 |557bytes |

Prior isolated Book1747ms/8 SQL has the same9149-byte DTO. Native source proof
establishes one fewer statement; differing context/probe/page conditions prevent
a whole-page causal claim. Pool checkout0.1ms each. Legal/domain phases are0ms in
these probes. Phases overlap, controls are not pure network latency, and stream
setup/partial-byte observations do not expose all server work. No authority cache
or database-topology change is introduced to meet a provisional target.

## Restoration, impact and remaining work

Dashboard development49718→optimized70926→development71421, restored through root
`bun run dev --local -f dashboard`; current launcher session70351. API48226,
Storefront46668 and Marketing90981 unchanged. Trusted-CA SQL-free doctor passes;
frozen source/lock/manifests and next-env parity remain. No API restart, push,
merge, provider action or deployment. Optimized start uses the same local profile;
wrapper leaves NODE_ENV unset for Next start to choose its normal production mode.

Private `/tmp/ewatrade-dashboard-program-20261029/finance-book-joined-*` retains
red/green/API/native/type/build/quick/H01/H02/parity logs, hashes/manifests, passed
receipt, fixed numeric family observations and restoration/fixture cleanup proof.
No credential, live SQL/parameter, private actor or response body is retained in
these diagnostic summaries. Brain BRAIN/task/QA/navigation/merchant Finance,
API contracts/permissions and a post-lock projection ADR updated locally. No
schema/migration docs or migrate/push command is required: app models are unchanged.

All23 open tickets remain. Next attribute Catalog's late document headers using
actual server callers before changing scheduling, then continue the remaining
Finance/Activity round trips, lifecycle/invalidation/delivery/interaction and
all original family/budget/acceptance criteria. Successful representative checks
and one fewer SQL statement do not complete the program.
