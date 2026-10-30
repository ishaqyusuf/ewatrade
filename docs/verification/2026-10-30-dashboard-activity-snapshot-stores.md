# Activity snapshot Store projection — 30 October 2026

Local source parent `0467b5343`. Full six-phase program remains **3/27 accepted
(11.1%)**. This contributes to DP-103/407; no deployment or whole-family acceptance.

## Cause and implementation

The preceding isolated probes measured about216–222ms for a separate Store scope
read after the locked Membership/admission projection. The red actual-scope test
observes two reads, expected one. Store choices now join the existing admission
SELECT inside its caller's existing repeatable snapshot, retaining `FOR SHARE OF m`.

The private projection returns only ID, name and sales-representative visibility,
ordered by name then ID. Owner/Admin retain all Business Stores, including archived
ones. Other operational roles retain active Stores; SCOPED staff additionally
require their own active assignment in that same Tenant. SQL also requires current
active Member/Tenant and an operational role before returning Store profiles;
the canonical JS refusal guard remains. No profiles are returned for denied roles
or inactive scope. Foreign, revoked and closed grants cannot add staff visibility.

Scope/Finance checks, signature construction and downstream event predicates stay
unchanged. All actual Activity owners remain RepeatableRead. Notification read/
configuration dispatch through `withNotifications`, and notification fanout's
scope owner, also retain RepeatableRead. No isolation change or command shortcut;
the shared notification commands and all their transaction options are unchanged.
The generic Finance Book/command guard remains its original post-lock reader.

`activityAdmission` now includes Store selection. The separate `activityStores`
phase is absent; parser support remains for historical traces. The optional QA
probe accepts current admission/projection phases without requiring that legacy
phase. No dummy zero-duration counter or weaker trace validation for required work.
Public inputs/DTOs, API/router/UI/cache/freshness and source/projection SQL remain.
No schema, index, dependency or provider change.

## Verification

- Red test:actual eligible scope invokes Member and Store reads; expected Member
  only. Final inert PostgreSQL scope/page/filter/legacy26 cases/450 assertions pass.
  Existing84 role/mode/subscription combinations, refusals, grants, name/ID ties,
  status changes, cursor/signature, exact money and pagination remain covered.
- SQL privacy cases inspect raw rows:unsupported/inactive scope returns no Store
  profiles; scoped staff receive only their permitted active Store. Member lock
  tuple inspection and commit release remain unchanged.
- Native PostgreSQL compares old/new complete scope results across91 combinations,
  including missing/inactive/no-grant cases. Outcomes, names, visibility, ordering,
  management/Finance flags and signatures match. The old Store lookup uses a
  strict query port executing its original where/select/order specification.
  Eligible scope operations2→1; denied cases can already use only one operation.
- Actual generated Prisma plus two-session native checks preserve the original
  Tenant/subscription snapshot while blocked on Membership, old Store/grant facts
  during that snapshot, fresh changed grants on the next transaction, and40001
  refusal for concurrent Membership revocation before data returns. Existing
  Finance guard/ReadCommitted negative-control/lock-retention checks retained.
  Native suites:10 tests/243 assertions, including the91 comparison outcomes.
- Native fixture schema adds only the Store columns required by the actual query.
  No application schema changed. Disposable databases removed, absence count0,
  isolated socket-only cluster stopped. An automatic-review timeout and sandbox
  signal restriction delayed cleanup; the narrowed fixture-only stop succeeded.
- DB/owned-test, API and Dashboard types pass. Explicit seven-owned-path fast
  plan/check:237 tests/1533 assertions plus QA tooling types/Biome pass. Foreign
  staged explainers and AGENT_CHAT excluded. Four affected intercepted diagnostic
  driver cases pass; unchanged ordinary driver evidence is reused.
- Source parity:canonical scope permission prefix and Finance/signature/predicate
  tail unchanged; list/filter/source/command/privacy/router/UI files byte-identical.
  Notification command/transaction source unchanged and all current owners audited.
- H02 reviewed impact passes. H01 reused:manifest/handlers/capabilities/procedures
  and coverage inputs unchanged. Finance code impact is fixture-only; no assistant
  or notification delivery promotion.

## Focused local result

Canonical existing-data smoke passed2026-10-30T09:06:10.653Z–09:06:46.303Z with two
isolated Activity GETs outside page observations. Existing development runtime;
`runtimeVerified:false`, complete API revision uncertified. Seven owned source/
test/QA hashes and lock frozen through the passed receipt, copied before doc edits.
Current phase shape and counts specifically agree with the new projection.

| Isolated read | Previous | Current | SQL previous/current |
| --- | ---: | ---: | ---: |
| Filters | 2072ms | 1821ms | 9 / 8 |
| List page | 2346ms | 2143ms | 9 / 8 |

Current API request1807.0/2131.4ms, context669.5/701.6ms and whole domain read
1123.9/1427.2ms. Admission including Stores214.8/217.5ms; separate Store phase absent.
Transaction-control636.1/647.7ms across3 statements each; projection268.7/531.7ms.
Pool checkout0.1ms each. Decoded response sizes remain15264/14074 bytes. Phases
overlap; no summation of nested work. These are individual observations, not p95,
optimized page timing or isolated causal attribution of the full differences.

The removed statement is proven independently of latency. Query projection still
takes about532ms on the list versus about269ms for filters; the actual list plan
and initial route-to-client edge remain the next attribution/fix frontier. Context
and transaction-control costs remain; no stale authorization cache introduced.

Existing QA Owner/data, populated Catalog and cancelled sale draft; bounded
Overview/Catalog navigation and order/stock sheets opened/cancelled. No broad
nine-family rerun or manufactured business data, money, grants, messages or
provider effects. App listeners API48226, Dashboard55140, Storefront46668 and
Marketing90981 unchanged. No app service restart, mode switch, TLS bypass or deploy;
trusted-CA doctor passes afterward.

Private evidence root `/tmp/ewatrade-dashboard-program-20261029/`:
`activity-stores-{red,tests,native,db-types,api-types,dashboard-types,quick-plan,quick,
driver,h02,smoke,doctor-before,doctor-after}.log`,
`activity-stores-{window,smoke-passed,parity}.json`, native fixture log,
`activity-stores-reads/{activity-reads,performance}.json` and original scope/member
copies. Native comparison source private `.scratch/activity-stores-*-reference.ts`
and `.scratch/activity-stores-native-comparison.test.ts`.
Brain current/feature/API/permissions and snapshot projection ADR updated locally.
