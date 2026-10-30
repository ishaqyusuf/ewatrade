# Finance snapshot permission projection —30 October 2026

Parent `728cd4a202871a3ad7370246b7cd59e353bd5e36`. Local DP-103/405 source
slice; full Dashboard performance program remains3/27 accepted (11.1%). No
application service restart, deployment, schema migration or business-data write.

## Finding and safe scope

The matching optimized baseline measured isolated finance.book1940ms/9 SQL and
finance.owedSummary2380ms/11 SQL, with roughly640ms context and tiny pool/serialization
phases. Those are overlapping diagnostics, not additive latency or this change's
before/after result. The actual two snapshot readers each performed a Membership
SHARE lock followed by a separate Membership/Tenant permission projection before
their Book and money projections. A red actual-reader probe records two admission
operations; the changed balance and owed readers each record one.

Only getFinanceAccountBalances and getFinanceOwedSummary now use the private
assertFinanceManagerSnapshot projection. Each already owns an explicit
RepeatableRead transaction; isolation/options are unchanged. The query joins
current Membership/Tenant facts and locks only the matching Membership with
FOR SHARE OF m. It retains inactive-row locking, active Owner/Admin/business
checks, exact Tenant fields and the existing FinanceError. No cache or reused
permission result is introduced.

The original assertFinanceManager, lockFinanceBook, finance.book and all command
paths remain byte-identical. This distinction matters: a two-session PostgreSQL
control proves a joined read under ReadCommitted can return an old Tenant active
flag/currency after a Membership lock wait. The canonical two-step guard sees the
committed change. A blanket replacement would be incorrect. The new helper is not
an alternative for arbitrary caller-owned or ReadCommitted transactions.

The existing Activity optimization was also audited. Its current Activity
list/detail/filter and notification owners use RepeatableRead. The actual helper
keeps its established coherent subscription/Tenant snapshot across the tested
lock wait, and a new transaction sees the changed scope. No Activity source was
reverted. The initial generic ReadCommitted counterexample did not establish an
Activity-page regression; caller isolation is part of the proof.

This is consistent with PostgreSQL's documented statement snapshots and locked-row
rechecks: [PostgreSQL16 transaction isolation](https://www.postgresql.org/docs/16/transaction-iso.html).
Midday's query-layer projection style is retained; the existing EwaTrade Activity
query is the closest lock/projection analogue, with explicit owner isolation.

## Invariants and checks

- Seven actual-Prisma/PostgreSQL cases,144 assertions, pass against an isolated
  socket-only PostgreSQL16 cluster.56 role/status/business-state combinations
  compare old/new guards. Scope parameters, fresh subsequent reads, current
  currency/timezone, missing actor/row, lock-wait snapshot parity, ReadCommitted
  control and current Activity subscription snapshots are covered.
- Concurrent Membership revocation gives PostgreSQL40001/PrismaP2010 for both
  snapshot guards; it does not accept changed authority. A real second-session
  UPDATE blocks until the guarded transaction commits or rolls back. The only
  RowShareLock is Membership, preserving the Tenant lock footprint.
- Existing actual balance/owed projection and Activity scope cases:19 tests/
  523 assertions pass. Reader adapters now reject an obsolete separate permission
  model read and require one snapshot projection before unchanged Book/money gates.
  They still require the exact RepeatableRead options. Canonical money arithmetic,
  bounded rows, independent sequences, exact minor strings and failures remain.
- Owned DB graph, API production graph and full Dashboard TypeScript pass.
  Scoped fast source checks237 tests/1533 assertions plus QA tooling types/Biome
  pass. The owned-file list excludes foreign Agent Chat/staged explainer changes.
- H01 coverage current and H02 zero capability/procedure changes pass. No new tool,
  procedure input/output, grant, rollout, API or command behavior is introduced.
- Normal guard, Book path, Activity source, money projections, API router and
  Dashboard route are byte-identical to parent. Apart from the new guard call and
  import, both reader files match parent, including all transaction/Book/projection
  logic and other readers.

The first disposable fixture run exposed missing canonical enum types and an
incorrect assertion about Prisma's serialized error shape. Its schema/error checks
were corrected; all seven cases then passed. No product check was bypassed.
The earlier green Activity projection proof used tuple inspection without a
second session; this new evidence addresses actual waiting/commit/rollback.

## Execution and cleanup

The test is deliberately opt-in through EWATRADE_INERT_POSTGRES_SOCKET, accepts
only an ewatrade-prefixed temporary Unix socket and fixed fixture role, and never
reads an application database URL/profile. It creates/drops a random private
fixture database on the explicitly provided disposable cluster. A normal run
without the fixture visibly skips these seven connected checks; the source smoke
is not claimed as their execution.

Executed command:

```sh
EWATRADE_INERT_POSTGRES_SOCKET=/tmp/ewatrade-dashboard-program-20261029/finance-lock-concurrency/socket bun --env-file=/dev/null test ./packages/db/src/queries/finance/manager-snapshot.concurrency.integration.test.ts
```

The owned cluster used listen_addresses='' and a0700 Unix socket. It was only a
synthetic concurrency test, not an application database/fallback. All generated
fixture databases were confirmed removed (count0), then its own pg_ctl stopped
it successfully. Application listener PIDs remained Dashboard36296, API48226,
Storefront46668 and Marketing90981. No application access/grant/subscription/money
records, provider state or real tenant data were changed.

No new browser sweep is needed for the unchanged DTO/markup/command/cache surface;
reuse the prior matching optimized18-action receipt for that surface. That4d6d
Dashboard artifact and the uncertified hot API do not certify this later helper or
a measured browser speedup. Book-before-panels scheduling, shared context, repeated
optimized samples and full DP-405 acceptance remain open. Do not close a whole
ticket for removing one permission operation in each of two reads.

Private evidence `/tmp/ewatrade-dashboard-program-20261029/`:
finance-snapshot-{red,green-probe,focused,concurrency,types,api-types,dashboard-types,
quick-plan,quick,h01,h02}.log, finance-snapshot-parity.json,
finance-lock-wait-probe.json and finance-snapshot-fixture-cleanup.log.

Brain: BRAIN/task/web-navigation-performance/merchant-finance/API permissions and
an isolation-owner ADR updated locally. No schema/relationships/migration or API
DTO documentation change is needed because those contracts are unchanged.
