# Service form read scheduling — 30 October 2026

Local DP-406 implementation under the [full performance program](../plans/2026-10-29-dashboard-performance-program.md).
Parent `45ee939a`, current checkout. Program acceptance remains **4/27 (14.8%)**.
No deployment, service restart, API/schema change or business submission.

## Cause and implementation

The direct Suspense-call audit found two remaining pairs in Service form owners:
catalog plus saved request links, and catalog plus intake settings. Each form
called `useSuspenseQuery` for Catalog before reaching its independent second hook.
Cold Catalog suspended the component and delayed the other read. Service deep-link
prefetch can hide the problem; a client-opened cold sheet still has this dependency.

Both owners now use the installed `useSuspenseQueries`, following the verified
Reports Stock pattern and Midday's independent-work scheduling principle. Exact
query options, Store inputs, keys, retry/cache policy and output bindings remain.
Intake still needs both current service choices and settings before showing the
form; this does not substitute default pricing while settings load. Saved-link
history retains its existing loading/error ownership, which remains a separate
DP-104 question.

The complete intake body from `assigneesQuery` onward and request-form body from
`formLabel` onward match the parent byte-for-byte. That includes optional assignee
and payment-account activation, amount/quote/surcharge calculations, draft/default
state, review/confirmation, command IDs/payloads, mutation callbacks and invalidation.
No command, permission, financial rule, URL owner or domain implementation changed.

## Evidence and boundaries

- Actual form/QueryClient/tRPC-option/observable-transport reproduction initially
  fails both held-Catalog assertions: only Catalog starts. The strengthened mounted
  fixture uses the existing DOM host pattern, real query observers, URL adapter,
  service offering projection, intake model and payment-account hook. Presentation,
  QA fixture controls, navigation and transport are inert ports; no app fixtures,
  provider or business command executes.
- Final four mounted cases/28 assertions pass, holding either member of each pair.
  Both exact reads start before release, required form content stays pending, current
  Store offerings exclude another Store, saved-link/express content remains, and
  warm unmount/reopen adds no operations. The nonmanager/default unpaid intake
  starts neither assignee nor payment-account reads. An isolated wrapper passes;
  global DOM/module mocks cannot affect unrelated suites.
- Production TSX direct-hook inventory: 18 modules/21 owners, zero owners with
  multiple sequential direct Suspense calls after these fixes. This does not resolve
  custom-hook dependencies, server awaits, all loading boundaries or every network
  waterfall; full DP-102/104/406 acceptance remains open.
- Full Dashboard and explicit fixture graphs pass. Owned four-path quick plan/check
  passes237 tests/1533 assertions, QA tooling types and Biome with zero unknown
  mappings. Foreign Agent Chat/staged explainers excluded. Source smoke does not
  replace the separately executed form regression or UI verification.
- Local development IAB with an existing QA Owner: Service work loads; New job
  opens with current services and disabled Review on the empty draft, then Close
  returns to Service work. Request links opens with current service checkboxes and
  blank name, then Close is used and the temporary test tab is discarded. No fields,
  service selection, Quick Fill, Create link, review, quote, order or payment is
  submitted. Existing live saved-link history is empty; the inert fixture covers
  nonempty history. Request-sheet URL-settlement timing was not measured.

Canonical existing-data local smoke passes 12:01:01.982Z–12:01:28.955Z with frozen
four owned source hashes and lock (exact timestamps in the copied receipt). QA
login/profile, populated Catalog, existing sale draft item/total/cancel and ordinary
navigation/sheet cancellation pass, with zero business submissions. This canonical
journey does not exercise the Service forms; their live checks are the IAB actions
above. `runtimeVerified:false`: development evidence, no release qualification.
The existing optimized `zMN4q6wxzuTfj0KPK4a8Y` artifact remains unchanged and excludes
this later Service slice. No new optimized build or page-speed ratio is claimed.
H01 inputs unchanged; valid coverage evidence reused. H02 passes one client record,
zero capability/procedure deltas. No service restart or provider change.

Private evidence: `/tmp/ewatrade-dashboard-program-20261029/service-form-*` and
`service-form-reads-*`: red/final/wrapper/type/quick logs, source/lock hashes,
direct-hook inventory and byte-parity checks. No SQL, request bodies, credentials,
actor/Store IDs or private response data are stored in the tracked receipt.

Brain feature, Service Commerce, QA, task and BRAIN pointers updated locally. No
API/permission/schema/durable architecture contract changes; no migration, API
document or new ADR is required. Other23 tickets and the full59-route scope remain.
