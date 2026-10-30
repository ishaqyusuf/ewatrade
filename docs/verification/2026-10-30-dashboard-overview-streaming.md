# Overview content loading ownership — 30 October 2026

Local DP-104/401 slice; parent `4f28d20da`. Full program remains **3/27 accepted**.
No deployment or application restart. Private evidence root:
`/tmp/ewatrade-dashboard-program-20261029/overview-stream-*`.

## Contract and finding

- Return Overview's admitted header, actions, sheet controllers and FAB after
  session/membership resolution, without waiting for content presence/visibility.
- Keep both current presence and current Order visibility ahead of private metrics
  and recent Orders. Do not parallelize private data ahead of those dependencies.
- Preserve all section order, role gates, URLs, commands, numeric meanings,
  previous nested loading/error boundaries and allowed Store identities.
- Verify actual server streaming, scope/error behavior and local source checks.
  Browser interaction timing, Back and optimized runtime remain separate acceptance.

The original async page starts presence and visibility concurrently, but awaits
both before returning any of its own header/actions. The actual Flight regression
reproduces the missing header while both ports remain pending. This is a page
composition wait, not a query-key mismatch or a new SQL bottleneck. Existing route
loading can show a generic placeholder, but cannot emit that admitted header early.

## Change and Midday fit

The route now composes its existing header/actions, `OverviewContent` behind
Suspense, and unchanged sheet/FAB owners. The server content owner performs the
same parallel presence/scope reads and composes the same sections after both
resolve. It receives only the required current Store, permitted Store IDs, member
role/gates, Tenant display identity/timezone and actor ID; the entire Tenant context
and its unrelated memberships/access payload are not passed into the new owner.
The existing numbers skeleton accepts unknown presence (four placeholders), while
known-presence calls retain their previous counts and empty behavior.

Midday's Overview route starts summary work without awaiting it before composing
its view. EwaTrade keeps its existing server readers and fresh scope resolution,
moving their waits to the owning content boundary rather than introducing a new
API, cache or permission bypass. No dependency/manifest, URL, draft, query key,
freshness window, database reader, schema, write or provider behavior changes.

The moved setup/numbers/needs-you/recent/store-link/businesses expressions retain
the approved Numbers-first/empty-setup-first design. A TypeScript printer comparison
passes19 moved expression/route flag/component checks, normalizing only the moved
`ctx?.membership` binding to its projected `membership` prop. Record:
`overview-stream-move-parity.json`. Existing section error boundaries remain;
presence/scope failure still reaches the route's error handling. This does not
claim new browser retry/error-isolation behavior.

## Actual Flight proof

The isolated fixture runs with Bun's `react-server` condition and Next's installed
React Server Components Flight encoder. It exercises the real route, content owner,
metrics/skeleton/recent-order server components, visibility resolver and metrics/
recent DB reader functions. Client components are registered inert client references
with a test manifest; auth, presence, policy/result transport and presentation ports
are inert. No client hook/controller, real message, money command, database or
provider runs. This is Flight serialization, not rendered HTML or browser hydration.

Two red cases reproduce absent early header output. After the change, nine cases
pass with57 assertions:

- Absent session/Tenant mounts no private content; existing layout admission remains.
- Header/actions/sheet/FAB refs and fallback stream while presence and fresh policy
  remain pending. Membership still gates that output; private reads stay absent.
- Both arrival orders preserve dependency ordering. OWN_SALES binds the actor;
  ALL_STORE_ORDERS retains its existing unfiltered creator scope.
- Refused current Store policy or failed presence starts no metrics/recent reads.
- Populated and empty Owner section key order remains exact; Owners acquire no
  staff policy read.
- A held numbers read still allows recent Orders to stream through its existing
  independent boundary.
- Two overlapping Tenant/Store requests retain their own header and actual query
  scope even when the newer request completes first.

The ordinary entry test launches this fixture in a separate process, avoiding
react-server conditions or mocks in unrelated tests. The Flight tuple inspection
checks ordered model keys and excludes debug/import/timing rows and fallbacks; it
does not stand in for a browser/client decoder. Actual SQL predicate and acquisition
proof from the previous unchanged reader receipt remains valid and is reused.

Final source/platform checks and their limits follow below. No page-speed or
optimized-runtime claim follows from the held-read fixture.

## Final source and local verification

Dashboard types and the explicit fixture/entry type graph pass, including the
final projected props and empty-identity case. The owned fast plan selects eight
paths, core/web/domain/mobile and zero unknown mappings; foreign staged work is
excluded. Fast checks pass237 tests/1,533 assertions plus QA tooling types/Biome.
H01 coverage is current in local mode with an unusable DB sentinel; H02 passes
for client with zero capability/procedure rows changed. The isolated ordinary
entry passes. `qa:doctor --offline` and `git diff --check` pass.

Frozen canonical local UI smoke passes01:30:50–01:31:10UTC: exact QA account,
populated Catalog, sale draft item/total and cancellation without submission.
Thirteen source/reader/scope/helper/lock hashes match afterward. Copy:
`overview-stream-smoke-passed.json`, `runtimeVerified:false`. This journey does
not time the early header, exercise pending/failure states, verify browser Back
or establish optimized runtime parity. The page-level Flight fixture proves its
streaming boundary; outer shell, transport and browser work can still dominate
the full navigation. No application restart, business write or deployment.

Prepared optimized9eb8 manifest hashes remain unchanged and exclude this source.
The separately pending timing/restoration request remains open. Brain impact:
local `BRAIN.md`, `tasks/in-progress.md`, `features/web-navigation-performance.md`
and the existing performance ADR record this owner boundary; no API/schema docs
change is required because those contracts/readers are unchanged. Full DP-104/401
and the overall program remain open at3/27 accepted.
