# Finance owed-summary projection — 30 October 2026

Parent `e053b9ed9`. DP-103/405 source milestone; full Dashboard performance program
remains 3/27 accepted. Local only; no deployment, service restart or live data writes.

## Finding and implementation

The actual reader reproduces four projection operations: unbounded supplier and
Customer directories, then their balance projections. Promise.all inside this one
interactive transaction does not make its SQL connection run statements in parallel.
The route needs counts, sums and only three parties, yet application memory receives
all directory rows, balances and ID arrays before sorting.

A private one-statement projection now returns two summary rows with up to three
names each. Separate grouped customer debits, allocations and releases preserve
canonical account-level debt arithmetic without multiplying joined rows. Supplier
payables keep their exact journal-line attribution. Counts and positive-only sums
cover the full scope; the displayed top three are not used to derive totals.

Fresh Membership SHARE lock, active Owner/Admin/Tenant and exact Book admission,
RepeatableRead snapshot and10s/30s limits are unchanged. Customer entries,
allocations and releases use each ledger account's saved sequence independently
of the Book snapshot used for suppliers. Future effective dates within those
saved sequences retain the original behavior. Unapplied credits, reservations and
supplier advances do not incorrectly reduce debt. All minor amounts stay exact
strings; only the count becomes a checked safe integer.

The existing currency/count/owedMinor/top response shape remains. Equal debts now
use ID as a stable secondary order; the old directory iteration order was unspecified.
All other financial readers, commands, API guards, DTO consumers, cache windows and
invalidation paths are byte-identical. No schema/index/migration or new endpoint.

Midday reference: its invoice-summary query aggregates in the DB by current team
and currency. EwaTrade keeps its own exact integer, Book and customer-ledger rules.

## Focused verification

- Old actual-reader diagnostic fails at four projection operations; new uses one.
- Seven actual-reader/PostgreSQL cases plus five retained journal-rule cases pass:
  12 tests/133 assertions.27 Tenant/currency/independent sequence combinations match
  unchanged canonical customer and supplier balance helpers and the old summarizer.
- Exact values above Number.MAX_SAFE_INTEGER, positive/zero/negative robustness,
  empty scopes, ignored credit/held/advance balances, committed future dates,
  excluded future allocations/releases, fresh sequence/name changes and stable
  ties for both party types pass. Numeric edge fixtures are inert stored read facts,
  not acceptance of a posting command.
- Actual reader still refuses inactive/missing authority and missing Book before
  projection; SQL errors preserve identity, parameters stay bound, and missing
  projection rows cannot silently report zero. Selected USD Book uses USD even
  when the Tenant default is NGN. Raw results are two rows with text amounts and
  JSONB top lists.
- Owned DB, API production graph and full Dashboard types pass. Source parity
  proves root admission/Book prefix, transaction controls and other reader unchanged;
  canonical balances/API/schema/UI/cache/invalidation/lockfile match the parent.
  Prepared f027 optimized manifest hashes still match and exclude this new source.

Scoped fast checks pass:237 tests/1533 assertions plus QA tooling types/Biome.
H01 coverage is current; H02 passes with zero capability/procedure changes. Final
owned/API/Dashboard type commands exit0. Foreign Agent Chat and
staged explainers are explicitly excluded from owned source checks.

## Synthetic query plans and bounded transfer

Disposable PostgreSQL contains12,001 customer accounts and6,000 suppliers with
relevant existing model indexes. Target scope has10,000 customers and5,000 suppliers.
Old directory statements are compiled by the generated Prisma client; old balances
run the unchanged canonical helpers. New output exactly matches old summaries.

| Work | Old | New |
| --- | ---: | ---: |
| Projection statements | 4 | 1 |
| Decoded rows across projections | 30,000 | 2 |
| JSON encoding of decoded rows | 2,545,561 bytes | 513 bytes |
| Shared-buffer hits across warm plans | 190,976 | 1,635 |

The byte count is an encoding of synthetic decoded rows, not measured PostgreSQL
wire or browser transfer. A first one-statement version retained per-account lateral
probes and used131,002 buffer hits; separate grouped projections remove those probes.
One-account scope among12,001 accounts returns the same107 minor units: old three
nonempty/empty projection statements use25 buffer hits, new uses20. No broad
foreign-account scan, extra index, temp read/write or app-database fixture is needed.

One warm EXPLAIN per statement is not a latency distribution. In that run, old four
plan execution times summed to about250ms, new163ms; small scope was0.146ms versus
0.216ms. These are database work observations, not a page-speed/p95/Production claim.
The implementation removes three round trips on the populated projection path;
remaining auth/Book/server costs and matching optimized timing remain open.

## Reused UI evidence and boundaries

The e053b9ed9 canonical nine-family/18-sample local browser receipt covers the
unchanged Finance route, Overview consumers, invalidation and retained shell.
No new ordinary UI session is required for this SQL implementation with the same
DTO/markup/commands; exact financial-read evidence is the inert PostgreSQL suite.
Stable tie order is verified at the data boundary. No live posting, account/grant/
age mutation, provider operation or business fixture. No new cache or API restart.

Private `/tmp/ewatrade-dashboard-program-20261029/` retains
`owed-summary-{red,green-probe,tests,types,api-types,dashboard-types}.log`,
`owed-summary-parity.json`, `owed-summary-source.json`, `owed-summary-plans.json` and earlier lateral-plan
comparison. The earlier optimized frontendf027 remains separate.

Brain impact: BRAIN/task pointers, merchant-finance/navigation features and API
contracts updated locally. Existing web-performance ADR records the bounded read
projection. No schema/relationships/migration or permission update required because
those authorities remain unchanged. No Finance roadmap leaf or release is accepted.
