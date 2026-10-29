# Dashboard sheet code recovery —29October2026

Partial DP-301 under the [27-ticket program](../plans/2026-10-29-dashboard-performance-program.md).
Parent3cf06633b plus owned source/lock hashes retained privately. Primary checkout;
local only, no runtime restart/switch, deployment, provider action or business write.
Overall acceptance remains3/27 (11.1%).

## Confirmed issue and change

The installed Next16.4.3 App loadable uses one React.lazy per dynamic declaration.
Its rejected import survives ordinary error-boundary reset. A read-only actual
installed-loader probe confirms this:1 test/6 assertions; fresh dynamic factory
loads again, ordinary reset does not. This is code-loading failure outside the
normal domain/data retry lifecycle.

New Dashboard-local loadSheetCode resolves an import failure to a local recovery
component. Manual retry calls the original literal loader again, deduplicates
pending retries, and renders the successful component with current props. Only
code definitions are retained. Closed global activation hides feedback; old-scope
unmount prevents late rendering/state/focus updates. Before mounting a recovered
whole sheet, focus returns from its temporary Retry control to its connected
opener when focus still belongs to that feedback. Body feedback remains inside
the existing frame. Generic errors reuse the existing Button/tokens and safe
Dashboard observability adapter; no error text or private payload is displayed.

All41 global feature imports and6 route-owned body imports use the adapter. The
successful path returns the original component. Existing domain errors still
reach their original boundaries. There is no data/session cache, automatic
business-command retry, query-key/TTL/invalidation/permission/URL change. Earlier
Catalog/Finance/Setup inner delivery owners and provider-entry recovery remain
separate scope; this does not assert every dynamic import has recovery.

Midday global-sheets/provider, customer-details-sheet and error-fallback were
compared. Existing route/header/table/filter/form/API ownership is retained. The
adapter addresses installed-loader behavior that route refresh alone cannot fix.
Compiler AST comparison confirms six exported controllers,47 literal targets and
all dynamic loading options unchanged. Compiled development output keeps actual
async chunk loaders; inspected Turbopack runtime drops rejected chunk resolvers
and invokes the loader again on another import. This is not browser fault proof.

## Executed checks

- Actual installed App loader with ReactDOM:5 failed recovery cases before the
  fix;6 tests/38 assertions pass. Repeated failure/recovery, retry dedup/current
  props, code-only remount reuse, scope/unmount/focus, closed visibility/current
  closed props, inline ownership and ordinary render-error propagation covered.
  Network, presentation and observability are inert; no external records/commands.
- Existing mounted global activation54/113 and route delivery13/40 pass; actual
  isolated Job factory revocation regression passes. Test hosts stub the newly
  imported observability/UI boundary; production controller/read authority runs.
- Full Dashboard TypeScript passes with8GiB checker heap. Owned fast source smoke
  passes220 tests/1483 assertions across41 files, including QA tooling types and
  changed-file Biome. Narrow scope excludes foreign staged explainer documents
  and AGENT_CHAT.md. H02 passes1 reviewed record,0 capability/procedure deltas;
  unchanged H01/router/domain evidence is reused.
  The new mounted test also passes a separate strict TypeScript entry check;
  explicit deferred component types and missing-DOM guards corrected its initial
  fixture typing errors. Its6/38 and Biome recheck pass. These post-smoke edits
  affect only test typing/guards and documentation; runtime source is unchanged.
- Existing-QA desktop IAB Services refresh and actual Service settings body show
  current controls, then Close restores More service options focus without Save.
  Catalog current detail resolves with Overview/Orders/Activity URL ownership.
  Orders tab resolves its existing ORD-058 link; Sales then opens the actual
  globally deferred Order detail with current items/totals/activity. Close returns
  focus to ORD-058. No payment, fulfillment or other business action is attempted.
- Final canonical frozen-source existing-data local smoke passes; private receipt
  copied before post-run documentation/commit. Actual sale form item/quantity/total
  and Cancel pass, shell retained and0 blocked business writes. Overview screenshot
  inspected. Receipt runtimeVerified remainsfalse. Current development samples:
  refresh3873ms, warm Catalog853ms/Overview1854ms, initial shell5610ms. Refresh
  scripts remain50 responses/2194632 encoded body bytes (~3KB above prior slice).
  This recovery fix is not a measured navigation speedup. One completed visible
  response includes6 SQL/acquisitions, context624.1ms, accumulated pool1129.3ms and
  SQL1254.9ms. Overlap is not additive; document/render/server work remains to
  correlate. Browser-to-API samples cannot expose all server-to-server work.

Prepared optimized3cf06633b build is deliberately preserved; no new optimized
build/runtime acceptance is claimed for this source. Old965f64794 window completed
previously and development mode was restored. New candidate timing/fault injection
and per-family budgets remain open. No causal speedup, production p95 or release
qualification follows from these unit/development checks.

Private evidence: /tmp/ewatrade-dashboard-program-20261029/code-load-*.
Brain impact: BRAIN, web-navigation-performance feature, in-progress tasks and
existing sheet-delivery ADR updated locally. No public API, database/schema or
permission contract changed; migration/database push not applicable.
