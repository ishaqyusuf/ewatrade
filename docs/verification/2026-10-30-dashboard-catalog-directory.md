# Catalog directory projection —30October2026

Partial DP-102/203/402 under the [27-ticket program](../plans/2026-10-29-dashboard-performance-program.md).
Primary checkout, parent88f8cf4d9 plus owned source/lock hashes retained privately.
Local only: no deployment, service restart/switch, schema/provider action or
business submission. Program acceptance remains3/27 (11.1%).

## Confirmed cost and implementation

The Catalog table fetched the full editor graph per row: option groups, unit
configuration, stock sources, variant selections and all offerings. Its visible
cells use a summary. A real route regression first failed because its prefetch
still selected full listItemsPage. The new protected listDirectoryPage procedure
and DB module provide only the visible row fields: identity/status, live variant
count, primary variant/offer label/count/price, product ID/usage/first scoped stock
text and current Store media. Nested display reads use take1; no editor graph is
serialized. A representative complex fixture is more than90% smaller; this is
not a measurement of ordinary merchant payloads or page-speed improvement.

The table does not consume global totalCount. A second failing cost check exposed
that unnecessary aggregate; the new directory read omits it. Default initial
loading needs one bounded projection SELECT, with a lookahead row for nextCursor.
Continuation retains the existing scoped anchor read. Ranked search keeps the
existing300-candidate cap, reads narrow search fields, then hydrates only the
selected page. Fresh detail predicates are reapplied at hydration; concurrent
changes can omit a no-longer-matching row until the next refresh. No locked
snapshot or financial authority is claimed for this directory.

Existing full listItemsPage, its totalCount and mobile/Assistant/sale consumers
remain. Filter/stem/search and keyset planning are shared with the old reader;
full serializer is unchanged. Input kind/status conversions share the existing
read module. A stale old test expectation omitted the pre-existing systemRole:null
count predicate; that expectation was corrected, not the production exclusion.

Server prefetch and actual table infinite consumer use the same new typed options
and canonical URL input. Route/header/table/columns/view/filter/selection/sheet/
draft ownership and layout stay intact. Primary choice/count/price and first
permitted stock-source display preserve existing behavior, including0/quote price,
archived-choice exclusion and Product usage. Scope/commands are current.

## Hydration and invalidation

Mounted actual table, installed tRPC options factory and real query observers prove
one prefetched read and no duplicate mount fetch. They also reproduced an
invalidation mismatch: queryKey() includes type:query and cannot match an infinite
key. Changed Catalog refresh owners use endpoint path keys or the existing
infinite filter. Directory invalidation now follows create/update/usage, stock
operations, finalized counts, receipt-source preparation and Catalog graduation;
existing broad Catalog invalidation covers photos and Assistant results. Draft
counts avoid directory refresh. Creation retains its RSC refresh and marks the
directory stale without another foreground read, verified through hydration.
Unrelated cache entries stay untouched. Broader mutation-map acceptance remains.

## Executed checks

- Actual directory/relational-port tests6/35 plus full-page and display regressions:
  combined11 tests/123 assertions pass. Covers display/ID/cursor parity against
  the real full serializer, payload bounds, scoped media/stock, keyset/ranked
  paging, primary fallback, quote/empty Service graph and read-error propagation.
- Actual route/table/tRPC/query-observer checks4/14 pass after route/invalidation
  failures. Canonical input, denied route, no duplicate hydration, exact/prefix
  refresh and creation's RSC refresh without duplicate foreground fetch pass.
- Actual protected router and staff scope checks13/49 pass with an inert database
  URL and no network. Missing/denied identity/Store, foreign QA, strict authority
  fields, current assigned Stores, revocation and no write grant are covered.
- Whole directory function through generated Prisma/local PostgreSQL:1 statement/
  acquisition,0 rows in a random nonexistent Tenant/Store, no stored fixtures,
  writes or private payload. Nested projection/count compatibility is verified.
- H01 snapshot generated and checked; H02 records existing catalog.page association
  and the new read. No new Assistant tool/write/rollout. Relevant final type/source
  checks pass: full Dashboard and API production plus owned-test graphs, fast237/
  1533, QA tooling types and changed-file Biome. Narrow owned-file scope excludes
  foreign staged explainers and AGENT_CHAT.md; no unsupported mappings hidden.
- Existing-QA desktop IAB: real Table and Grid show Notebook price300/stock10 Piece,
  multi-variant and internal-use rows. Original Table restored. Existing Notebook
  detail resolves; Overview/Orders/Activity first reads and all three warm revisits
  work, with content retained on revisit. Close returns focus to the original row.
  No edit, stock, payment or other business action. API remains the same existing
  hot-reload process; no manual restart. Timing acceptance follows canonical smoke.
- Existing optional performance artifact capture also saves a private Catalog
  screenshot after timing readiness, alongside the Overview image. Its3 isolated
  browser-driver checks pass. No extra runner or business fixture is introduced.

Final frozen-source canonical existing-data smoke passes. The receipt is copied
privately before documentation edits; it reports runtimeVerified:false, so it is
local development evidence, not optimized or release acceptance. Existing QA login,
populated Catalog, sale draft item/total and cancellation pass without submission.
The shell stays mounted, and no business writes were attempted or blocked. The
private Catalog screenshot shows the expected table, prices, stock and live rows.

One bounded development run reports initial post-login shell 5818 ms, Catalog
full refresh 4054 ms, first measured Catalog transition 1947 ms and warm Catalog
853 ms. Overview transitions are 1034 ms then 2382 ms; the latter includes cancelled
background requests. These sparse uncontrolled samples establish neither p95 nor
a causal speedup against the prior 4535 ms refresh. Full refresh still misses the
intended experience and remains an open problem.

The refresh observes a 3850 ms document and one completed 3592 ms browser API read.
That API read reports request admission/context 2955.4 ms, auth 1464.5 ms, proof
1283.2 ms, six pool acquisitions totaling 1976.5 ms and SQL totaling 1239.4 ms.
These phases overlap and include background work: they are not additive wall time,
a trace of every server-to-server read, or proof that this particular directory
SELECT consumed those costs. This evidence prioritizes DP-003/103 admission/pool
correlation rather than claiming the smaller directory solved refresh.

Owned source remains identical to the frozen smoke hashes; only documentation is
updated afterward. Source checks, the API/owned-test and Dashboard type graphs,
H01/H02 and the three driver checks pass. The supplemental QA tooling/doc fast
scope passes 47 tests/195 assertions; it overlaps earlier checks and is not summed
as unique coverage.

Midday Customers route/table/router and DB projection pattern inspected. Domain
read ownership stays in packages/db; no parallel command model or visual redesign.
Prepared optimized3cf06633b build remains untouched; current optimized acceptance
and all-family budgets are open. No statistical production/native/release claim.

Private evidence: /tmp/ewatrade-dashboard-program-20261029/catalog-directory-*.
Brain impact: BRAIN, feature/task pointers, API endpoints/contracts/permissions and
new directory-projection ADR updated locally. No database schema/relationship/
migration changed; database push/migrate is not applicable.
