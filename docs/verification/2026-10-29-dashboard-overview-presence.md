# Overview feature presence —29October2026

Partial DP-103/401 under the [27-ticket program](../plans/2026-10-29-dashboard-performance-program.md).
Primary checkout, parentdb38e82f8 plus owned source/lock hashes retained privately.
Local only: no service restart/switch, schema/provider change, deployment or
business submission. Program remains3/27 (11.1%).

## Root cause and implemented contract

Root Overview awaits getWorkspaceFeatureAvailability before composing its sections.
The actual reader made9 repository calls for a handful of presence flags, despite
returning no rows to the UI. A deterministic acquisition-count regression fails
with expected1/actual9 while8 existing behavior cases pass. This demonstrates a
fan-out cost; it does not by itself attribute all page latency to that function.

The DB boundary now executes one parameterized PostgreSQL EXISTS projection,
returning9 booleans in one current snapshot. Existing deriveWorkspaceFeatureAvailability
and public DTO remain unchanged. Both direct Overview and the protected feature
availability API reuse that existing owner. No data cache, longer TTL, new feature
access, API procedure, command retry or query invalidation is introduced.

Exact original predicates remain: Tenant/Store operational scope; Catalog kind
and system-role exclusion; Catalog presence regardless of current item/availability
status; active item/offering/variant, fixed non-null price and available Store
for sellability; Customer directory across the Tenant or identified order in the
Store; Staff historical membership without a new status filter; active prescription
settings. In particular,0 price and empty-but-non-null customer fields still count.
Performance work does not silently redefine those historical product semantics.

Midday packages/db/queries/teams.hasTeamData supplied the nearest EXISTS projection
pattern. EwaTrade keeps Prisma.sql, its existing DB boundary and fresh protected
admission. Route, table, header, form, URL, draft, mutation and assistant authorities
are unchanged. No schema/index/read-model migration or infrastructure tuning.

## Executed checks

- Actual reader10 tests/26 assertions pass after the9-call red regression. Existing
  pure flag derivation remains covered; one query, bound scope parameters, fresh
  calls and read-error propagation pass. Previous per-ORM-call shape assertions
  are replaced by the actual SQL predicate matrix below rather than retained as
  false confidence in a removed implementation.
- Actual PostgreSQL:46 inert cases/414 boolean checks pass in one read-only CTE
  statement using the actual projection builder. All10 referenced tables are
  shadowed by inert CTEs;0 stored fixtures,0 writes and no private business rows
  read. Cases cover foreign Tenant/Store, both Catalog kinds, hidden/system rows,
  missing/draft/unavailable/variable/null/zero-price variants, Customer fallback,
  historical and role-specific Staff, Service/stock presence and prescriptions.
  One additional real-schema EXPLAIN without ANALYZE validates table/column/type
  compatibility and inspects the plan without executing the projection. No
  business records are returned or mutated; no index/provider change follows.
- API production-entrypoint plus owned-test/fixture strict types pass; full
  Dashboard types pass with8GiB checker heap. Owned fast237 tests/1533 assertions
  across45 files, QA tooling types and changed-file Biome pass. Explicit scope
  excludes foreign staged explainers and AGENT_CHAT.md. No unsupported mappings.
- H02 passes1 reviewed record,0 capability/procedure deltas. Existing unchanged
  H01/router/command evidence is reused; this changes only the internal reader.

Final canonical frozen-source existing-data local smoke passes. Its private receipt
was copied before post-run documentation/commit; runtimeVerified remainsfalse.
The Overview screenshot shows the same ready summary/Catalog/stock cards, recent
orders, Setup and store strip; expanded sidebar partially covers the left edge.
Sales draft item/quantity/total and Cancel, Overview order/stock open-and-cancel,
shell retention and0 blocked business writes pass. No sale, stock or other business
submission. Development samples: initial shell5518ms, Catalog refresh4535ms,
first transitions Catalog2885ms/Overview2718ms, warm Catalog859ms/Overview1032ms.
Prior warm Overview1854ms had different connection/compilation conditions, so a
causal page-speed ratio is not established. The9-to1 availability reader reduction
is deterministic; shared initial admission/render latency remains open.

The prepared3cf06633b optimized build remains unchanged. No optimized comparative
speedup, production p95, native or release acceptance is claimed by source checks.

Private evidence: /tmp/ewatrade-dashboard-program-20261029/availability-*.
Brain impact: BRAIN, web-navigation-performance feature, API contracts, in-progress
tasks and existing web-navigation ADR updated locally. No schema/relationships/
permissions/endpoint shape changed; migration/database push is not applicable.
