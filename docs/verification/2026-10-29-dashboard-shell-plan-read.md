# Dashboard shell plan projection —29 October2026

Partial DP-103/401 work under the [full program](../plans/2026-10-29-dashboard-performance-program.md).
Primary checkout, parent7eea9585e plus owned source hashes in the private evidence
directory. No deployment, schema/migration, provider configuration, plan change,
business submission or new business fixture.

## Reproduced cost and change

The actual authenticated shell loaded `getRetailOpsTenantPlan` only to read
`plan.features`. That reader fetched Tenant metadata, then the full plan directory
and durable subscription/plan in parallel:3 repository reads across2 serial stages.
Limits, names, prices, descriptions and directory rows were unnecessary for menu
selection. The real-shell regression initially2 passed/2 failed on those excess
reads; admission and existing fallback cases already passed.

`getRetailOpsTenantPlanFeatures` now lives in the existing billing query module.
It selects current Tenant metadata plus only durable plan key/provider/status/
reviewer binding/expiry in one joined query. Existing catalogue-owned features and
current subscription resolution remain authoritative. It does not introduce a
cross-request cache. Unrecognized durable plan rows are ignored before metadata
fallback, matching the full reader; parity tests caught and corrected that ordering.

Missing billing tables/columns delegate to the existing metadata fallback. Other
query failures propagate to the shell's unchanged optional-read fallback. Fresh
signed-in/workspace admission still precedes the plan read. Free-plan navigation
stays gated; a failed optional plan read still leaves navigation ungated while the
API enforces current permissions, as before. Full billing snapshots, command checks,
native/reviewer policy, limits, transactions and provider operations are unchanged.

## Evidence

- Actual shell regression4 tests/9 assertions passes, exercising its real route
  function and real repository functions with inert transport/auth/UI boundaries.
  It runs in a separate Bun process because module mocks are process-wide. It proves
  one plan repository read, Free gating, optional failure and no plan access before
  signed-out/missing-workspace redirects; it is not a React/browser timing profile.
- Billing parity plus existing subscription suite18 tests/215 assertions passes.
  The new suite compares27 policy cases with the canonical full reader: launch/
  Free/metadata, revoked launch grant, known/unknown durable keys, native and reviewer
  bindings, active/cancelled/expired periods and ordinary manual/Stripe records.
  Current rereads, isolated returned arrays, missing-table fallback and unexpected/
  missing-record error identity pass. No synthetic record was inserted in a database.
- One bounded read-only comparison against the existing selected local QA workspace
  confirms identical features and actual SQL counts3→1. Selection used one additional
  indexed existing-membership read. Full reader1715.7ms included1275.1ms accumulated
  pool work; narrow reader214.2ms used an already warm pool. These are not comparable
  page-speed samples or a causal latency ratio. Query-count reduction is the finding.
- Owned-path fast source smoke237/1531 across45 files, QA tooling types/Biome and full
  Dashboard source types pass. The mapping does not include the new shell/billing
  regressions; they ran separately. Foreign staged explainers/Agent Chat excluded.
  H02 impact passes with no capability/procedure deltas. H01 router source unchanged;
  prior current coverage evidence retained. No new optimized build is claimed.
- Desktop IAB, existing QA account: refreshed Reports renders current shell, Finance
  navigation and the loaded30-day chart. No command, plan choice, export or invitation
  submitted. Running Dashboard remains development mode; no service restart required.
- Canonical existing-data local web smoke passes in the frozen source window:
  QA login/exact profile, populated Catalog, existing item/total in a sale draft,
  cancellation without submitting. Receipt checkout7eea9585e plus owned dirty
  hashes; `runtimeVerified:false`, development evidence only. No runtime switch,
  service restart or release qualification. The receipt is copied privately before
  the eventual local source commit changes the checkout identity.

Private evidence: `/tmp/ewatrade-dashboard-program-20261029/shell-plan-*`:
red/green shell results, parity red/final, SQL comparison, types, fast smoke, impact,
source hashes and `shell-plan-proof.jpg`. API-context1s from the earlier baseline is
a separate remaining cost; this projection does not remove those authority reads.

## Remaining acceptance and Brain impact

Broader scheduling, complete per-family attribution and final latency budgets remain
open. This is one shared boot improvement, not completion of DP-103 or the full
Dashboard. Overall accepted3/27 (11.1%) unchanged. Optimized-runtime comparison of
post965f64794 source remains pending; the previous approved runtime window is closed
and development mode restored.

Brain feature, billing packaging, API contracts, task and BRAIN pointers updated
locally. No schema, relationship, migration, public endpoint or permission contract
changed; no migration/push is required. Existing architecture supports this narrow
projection without a new ADR or subsystem.
