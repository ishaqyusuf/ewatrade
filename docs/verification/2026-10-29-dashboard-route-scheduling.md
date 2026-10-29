# Dashboard route read scheduling —29 October2026

Partial DP-103/204/405/406 delivery under the [full program](../plans/2026-10-29-dashboard-performance-program.md).
Primary checkout, source parent deb7d5b95. Private source/lock hashes are recorded
in `/tmp/ewatrade-dashboard-program-20261029/scheduling-source.json`.

## Root cause and change

Actual Finance route orchestration awaited display cookies serially before its
independent finance book read. The actual Services route prefetched both manager
request lists and link forms on the default Work tab and a hidden Work queue on
Requests. A cashier's request-sheet URL also caused a catalog prefetch even though
the manager-only request sheet could not mount.

Finance now overlaps table/view preferences and the book after unchanged session,
Tenant and role admission. Selected list prefetch still depends on the returned
book ID. Services reads the same typed URL parsers as the client, extracted into
`hooks/service-work-params.ts`; old hook exports remain compatible. It prefetches
only the authorized selected table plus dependencies of an open intake/link/request
sheet. Invalid URL values default consistently; non-managers retain Work. Existing
limits25/100, Store inputs, sort, URL history, mutations and permissions are unchanged.

## Evidence

- New actual-route regression initially2 passed/6 failed: Finance had not started
  its book while display reads were pending; Services started unwanted dependencies.
  After repair11 tests/20 assertions pass. Real QueryClient is used; session, data
  transport, display readers and non-rendered UI are isolated. Tests exercise the
  real route functions, not a duplicate scheduling helper. This file is run in its
  own Bun invocation because module mocks are process-wide.
- Default Services Work now starts1 endpoint versus3; Requests starts1 versus3.
  Open request links/detail retain their dependencies. Invalid params, sorting,
  cashier fallback, signed-out admission, missing Store and Finance role admission
  pass. These counts describe route prefetch work, not all browser/background reads.
- Existing filter/sort checks2/9 pass. Owned-path fast source smoke220/1481 passes;
  its41-file mapping does not include the new route regression, run separately.
  Foreign staged explainer docs/Agent Chat are explicitly excluded from the smoke scope.
- Full Dashboard source types and optimized Next16.4.3 build pass; expected generated
  production route references restored. Dashboard tsconfig excludes test files;
  the new regression is executed by Bun. Changed source/test/metadata Biome pass.
- Desktop IAB, existing QA workspace: real Work table shows2 jobs; Requests shows1
  existing request. Request links opens existing form/link list and two service
  choices; Close works. No link created, status changed, form saved or fixture added.
- Bounded single development observations: Work refresh to existing job2613ms;
  Requests refresh to loaded count12206ms; first Work visit after Requests refresh
 3042ms (not a cached revisit). Once both loaded, Requests95ms/Work125ms. Finance
  refresh to its summary5979ms. No percentile or production speedup claimed.
- Services→Finance soft navigation did not finish within two observation deadlines;
  direct Finance navigation succeeded. Later normal Bank link completed after
  compilation and displayed the existing statement. Slow/pending first navigation
  remains an explicit DP-003/405 issue, not accepted as optimized behavior.
- An API observation window included5 completed requests with wall times3386/5488/
 1680/1697/1677ms. Context work2754/3180/1050/1068/1046ms; overlapping pool work1274/
 5045/0/0/0ms. Windows include background work and are not attributable entirely to
  a route. Durations overlap; do not add them as wall time. Fixed numeric diagnostics
  contain no payload/SQL/identity. The traced API remained running; no restart here.

Private files: `route-scheduling-{red,tests,types,quick}.log`, `scheduling-build.log`,
`scheduling-url-tests.log`, `route-scheduling-ui.json`, `finance-navigation-traces.json`,
`services-requests-scheduling.jpg`, `finance-bank-scheduling.jpg`. Canonical prior
smoke remains relevant to unchanged sale behavior, not a new release receipt.

## Remaining scope

DP-103/204 remain open for broader scheduling/polling and optimized-runtime proof.
DP-405/406 still require complete family acceptance; measured initial loads miss
targets. Overall3/27 (11.1%) unchanged. No deployment/push/service restart/provider
change or business submission. Brain feature/task/BRAIN updated locally; no API,
schema or permission contract changed. H01 source unchanged, previous current
coverage evidence retained; H02 must pass for the new client slice before commit.
