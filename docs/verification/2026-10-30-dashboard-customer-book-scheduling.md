# Customer-book read scheduling — 30 October 2026

Local DP-103/404 slice; parent `86983e0f`. Program remains **3/27 accepted
(11.1%)**. No deployment or shared-service change. Private evidence prefix:
`/tmp/ewatrade-dashboard-program-20261029/customer-book-scheduling-*`.

The Dashboard loader resolves current Order scope, then reads the customer book,
then obtains permitted ledger balances for the resulting IDs. Inside the book,
the full Order-history aggregate previously completed before the independent
saved-Customer query began. The one production caller is Dashboard sales-data.ts.
A deferred actual-reader test reproduces the serial dependency: while Order
projection is held, saved findMany has zero calls (expected one).

The book now overlaps those two existing reads with Promise.all. An own-sales
book still skips saved Customers completely. Merge and balance dependencies stay
intact: both reads must finish before matching and downstream balance IDs exist.
The Order SQL, Tenant/Store/creator/search inputs, saved filter/select/order,
normalization, contact precedence, rows, dates, counts and exact amount strings
are unchanged. No API, cache/TTL, grant, schema/index or business command changes.
There are still two reads when saved Customers are included and one otherwise.
The existing independent snapshots do not become an atomic snapshot. Two reads
may occupy two existing pool slots; pool configuration and query work are unchanged.

This follows Midday's independent customer-summary reads in
packages/db/src/queries/customers.ts:getCustomerInvoiceSummary while keeping
EwaTrade's Prisma repository and authority boundaries. It removes one serial
edge; it does not prove a browser latency improvement. The existing unbounded
Order aggregate/saved directory and balance projection remain DP-404 work;
no row cap or changed summary meaning is introduced to conceal that issue.

Focused proof runs the actual listCustomerBook/listCustomerOrderDirectory with
inert DB ports, without a DB connection or stored fixture. Nine cases/26 assertions
pass after one red scheduling case. They cover concurrent startup, waiting for
both results, either read failing while the other is pending, Tenant scope,
literal search escaping, direct ID/phone/email matching, deterministic contact
precedence, saved rows without Orders, amount strings and own-sales exclusion.
Failure propagation neither masks errors nor claims cancellation of a query
already issued. An initial deferred-expectation test harness stalled; only that
inert test process was stopped, then the expectation was ordered correctly.
No application service was stopped or restarted.

Owned DB source/test types and full Dashboard types pass. The five-path owned
fast scope passes237 tests/1,533 assertions, QA tooling types and Biome; all four
groups are selected, no unknown mappings. Foreign staged files are excluded.
H01 coverage remains current; H02 passes for domain with zero capability/procedure
rows. Offline doctor and diff whitespace checks pass. AST comparison proves the
Order projection, saved query and merge are identical before/after (private
`customer-book-scheduling-parity.json`); the Dashboard loader is byte-identical.
The four prepared9eb8 optimized manifests remain unchanged and exclude this slice.

Brain impact: update current pointers, navigation feature and customer-ledger
feature. No schema/relationship/migration, API-contract or new architecture
boundary changes require additional database/API/ADR documents. Actual DB query
latency/plans, browser Customers loading, Back/filter/draft flows and optimized
per-family budgets are not established by this inert test. Previous UI receipts
remain evidence of their recorded source and platform only. A new UI pass is not
needed for this scheduling-only slice; markup/DTO/command owners do not change.
