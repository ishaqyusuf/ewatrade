# G02 paused object cache source review — 12 October 2026

Coordinator assigned the four desktop object sheet wrappers after source checkpoint
`ce1226cf`: original cash count, day-close, business report and service intake.

A real TanStack cached success can have `isPending=false`, `isFetching=false`,
`isError=false`, and `isPaused=true` while fresh authorization is offline. Before
this patch all four wrappers could show that cached payload. Native query keys use
procedure/input; actor/Tenant/Store are implicit request context. The dashboard
clears its browser query client after successful workspace switch and sign-out,
and clears rejected cached data on FORBIDDEN/UNAUTHORIZED/NOT_FOUND. Those safeguards
remain intact, but a paused read receives no rejection and can arise without a
workspace switch (for example after offline reopening or access revocation).

The four wrappers now treat a paused read as loading. The day summary also waits
for an unpaused checklist; a paused day alone withholds its totals. Report pagination
and intake refresh footer do not expose cached-object controls during pause.
No shared factory, cache client, helper, query key, catalog or export was changed.

Validation: isolated Bun process for `assistant-object-paused-cache.fixture.tsx` via `assistant-object-paused-cache.test.ts`,
**3 tests / 33 assertions passed**. A real QueryObserver receives a synthetic cached
payload while offline with zero query-function calls. Actual sheet wrapper branches
hide it; normal authorized success branches/pagination still render. Query/cache,
TRPC option hooks, SheetFrame and child content use explicit mocks; this does not
prove native authority, saved runtime navigation, styles, or actual actor switching.
The outer test launches an isolated Bun process so fixture module mocks cannot leak
into other tests; its exit check passes. Focused dashboard TypeScript passed (exit 0);
six-file Biome passed after formatting.

Ignored `paused-cache-source-v1.html` contains the isolated synthetic branch render.
CUA rejected opening its file URL because its browser URL policy permits only
HTTP/HTTPS and explicitly forbids workarounds. **No screenshot was captured** and
no alternate browser/server was used. This is not saved browser acceptance.

No DB connection, provider, key/visibility change, persistent fixture, API lifecycle,
HTTP check or mobile work. G02 remains partial/planned/unaccepted; accepted 13/45.
