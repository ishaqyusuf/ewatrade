# Backend checkpoint — 15 October 2026, 18:46 UTC

Purpose: preserve unfinished backend source while the coordinator completes the
latest grouped Workshop review. **Full phases 4–12 / G03 remain open; acceptance
stays 13/45.** This is source evidence, not rollout, schema, connected QA,
provider, runtime, public GENERAL or device acceptance.

## 1. Quote approval: new outside-transaction preflight

Root-owned `packages/db/src/queries/commerce-quote-reviewed-decision.ts` now
provides pending-only inspect TX -> outside prepare -> fresh owning TX approval:

- Inspection uses the actual read-only decision review, copies exact
  actor/Tenant/Store/approval/Quote/Version/reason, decision identity, complete
  target, source, policy revision, Terms and saved release texts into private
  WeakMaps. No TX or execute closure is retained in the plan.
- Preparation calls actual native `prepareCommerceQuoteApproval` outside TX;
  configured text screening covers raw labels AND the trimmed labels used by
  actual linked presentations, all option notes/promises and line notes.
  Concurrent/repeated prepare for one plan resolves to one opaque proof and
  one native identity; failure needs fresh review rather than provider fallback.
- Final approval rechecks exact current caller scope, server publication and
  complete fresh target, then uses actual reviewed execute with actual native
  prepared approval. Missing/forged/cloned/wrong-kind proof refuses; explicit
  invalid native evidence never selects the ordinary inside-TX screen path.
- Native ordinary and clinical paths remain separate. The native optional
  prepared branch preserves authority, current Terms, source/availability,
  maker-checker, policy and CAS checks. The safe reviewed receipt strips native
  bearer tokens. Linked messages/invitations/unread intents remain DB effects,
  not provider delivery.

Source-revision finding and repair: the actual-chain regression initially
failed because changing source revision 3 -> 4 without changing status still
approved, presenting the source at revision 5. Root changed the pure decision
review to select status+revision for BOTH source kinds, require a safe integer
revision >=0 and bind `review.sourceRevision` into the complete target digest.
The same test now refuses before business effects. Root also updated only the
legacy decision fixture's sourceRevision state and source-return fields.
Completed/terminal recovery is not routed through this pending-only helper.

Observed current hashes:

| Path | SHA-256 |
| --- | --- |
| `packages/db/src/queries/commerce-quote-reviewed-decision.ts` | `4a5e0d044009e461dd51159379e5669e5e55652c17074c4a1531b4e6fd39ed4c` |
| `packages/db/src/queries/commerce-quote-decision-review.ts` | `4cef0201bd42a3733d61a55bba33d2188f9e8ad0ab630ffe287566f2238ff5e9` |
| `packages/db/src/queries/test-helpers/commerce-quote-decision.ts` | `07dcf6e6d34e07cb8db1d49d7157819dcb0d2c38233892ec84cf86569054a7a7` |
| `packages/db/src/queries/commerce-quote-reviewed-decision.test.ts` | `cef0b4ed35593f5e7128ce194e67779db8c1f10f264167c60737d828baba06a2` |
| `packages/db/src/queries/test-helpers/commerce-quote-reviewed-decision.ts` | `e590ed971ea34cbf823d992156e6efbbd4115f12815b5082a63df23ee825c794` |

Worker-verified focused evidence: **16 tests / 268 assertions pass**, two-file
Biome clean. Actual canonical functions; no module mocks. Inert persistence
delegates reuse the existing decision fixture and actual linked-release transport
stand-ins, with strict new source/version/link predicates and a fail-closed
method allowlist. Provider factory instrumentation proves configured QA screens
at simulated TX depth 0; initial/final Production screen is unavailable; fetch
is forbidden. Full 20×100 +100 linked chats produces 100 presentations,
100 invitations, 100 unread intents; the final 2000th line-note rejection proves
screening does not truncate. SERVICE Inquiry zero/unavailable approval covers
owned-line counting, source audit and linked release, not Product inventory
readiness. Tests cover Terms/roles/policy/scope/source/head/all-text/expiry/link
drift, copied snapshots, opaque evidence, dedupe and exact safe receipts.
Late synthetic failure honestly leaves mutated local rows; explicit restoration
simulates owning rollback before proof reuse and is **not SQL rollback proof**.
The last test-file-only edit adds an explicit return type; runtime test body
matches the passing run. Root separately ran legacy native regression:
`/private/tmp/assistant-quote-approval-legacy-tests.log`: 81/679 across 6 files,
before the later sourceRevision repair; rerun current aggregate before credit.

## 2. Booking availability, API and canonical evaluator

Source inspected, not rerun by this checkpoint worker:

- NEW `packages/db/src/queries/service-commerce-bookings/staff-availability.ts`
  reuses the actual native slot-facts reader and evaluator, accepted native
  Owner/Admin or explicit attendant authority, active Tenant/Store/member/current
  access revision, exact eligible Service source, active config/resource and
  read-only SERVICE/staff booking policy. No customer capability, fake clock,
  reservation exclusion, policy audit, mutation, notification or provider.
- Bounds: positive requested window <=31 days; 1000 rows per fact collection
  admitted via 1001 sentinel; <=500 candidate scans; <=100 returned slots;
  quantity 1..10000. Complete facts load once per requested window. Overflow or
  malformed facts refuse as unknown; an empty bounded page is not global absence.
- Cursor binds actor/access/source revision, exact original filters and current
  config/resource/settings revisions and timezone. Continuation uses a fresh
  server clock/live capacity; it is not a durable snapshot or reservation.
  Output labels `live_unreserved`, payment/provider settlement `not_checked`.
- Shared evaluator now checks the whole half-open UTC interval against the union
  of recurring local hours and explicit OPEN intervals, preserving subsecond
  gaps, midnight/week boundaries and DST fold/gap transitions. Mere partial OPEN
  overlap cannot open an entire slot. Conservative overlap-sum capacity and
  conflicting override semantics remain. Rule projection groups saved identity
  AND interval rather than collapsing different times under one client rule ID.
  Native lifecycle/public slots/settings reuse that projection/fact reader;
  public resource enumeration now also restricts active exact Store resources.
- NEW strict `assistant-booking-availability.ts` accepts only exact Service source,
  Offering/resource IDs, Date from/to, optional quantity/limit/cursor. NEW
  `serviceAssistantBookings.availability` protected QUERY derives current GENERAL
  actor/Tenant/Store via actual `requireGeneralScope`, uses one bounded
  RepeatableRead 10s-wait/30s-timeout TX and maps canonical refusals without retry
  or empty-page fiction. Router fixture mocks canonical persistence, not its
  protected scope/schema/control-flow; canonical DB fixture covers actual logic.
- Source registration currently exists in `_app.ts`; DB package exports the
  narrow `./service-booking-availability`; inventory classifies the procedure
  **planned G03**; central staff policy admits only the query and has exact
  negative mutation tests. This is no GENERAL tool/action or grant activation.

Booking source freeze observed:

| Path | SHA-256 |
| --- | --- |
| `packages/service-commerce/src/bookings.ts` | `b831cb3aaa92512c4e38aa2f9bf802012d5b35ed68ca548d9232d025db131435` |
| `packages/db/src/queries/service-commerce-bookings/staff-availability.ts` | `0c0aa84eabf5a59c5a64d48554017c45b548ce54a8f2c494784b4d8fa1d26446` |
| `packages/db/src/queries/service-commerce-bookings/lifecycle.ts` | `2edbf40564eff09b0432334268acb877f5f7bf88349a39591b0a42f53e007a0a` |
| `packages/db/src/queries/service-commerce-bookings/shared.ts` | `8673fbc0c33d3d4b3ee302afa02c7c041a73184a590c46f106218ec328effb18` |
| `packages/db/src/queries/service-commerce-bookings/settings.ts` | `3d7cccdcf4170bfec0b6442c7bf4c15f3f7f523f5da749c0cb29f4c64844195c` |
| `apps/api/src/schemas/assistant-booking-availability.ts` | `40a509740bd62ff4888815e8074f0ab8a113644e24189778e54c16b62a9743fb` |
| `apps/api/src/trpc/routers/service-assistant-bookings.ts` | `5d712d6bfefd62becab996ef5e213dbac3df78fb184b0d11416aeb25581650d1` |
| `packages/assistant/evaluations/fixtures/booking-availability-router.fixture.ts` | `04af18fbdda2e2ef5e94671de3810bb1a23cf4069c2e5ff7083564c4e1c3e42f` |

Ownership/baselines: `/private/tmp/assistant-booking-availability-integration-ownership.md`,
`assistant-booking-availability-integration-baseline/`,
`assistant-booking-availability-api-baseline/frozen-hashes.json`. Current source
hashes match the API freeze record. Do not discard unrelated shared hunks.
Sibling report received after source inspection: native booking/evaluator owner
reports **55 tests /294 assertions across 4 inert suites**, nine-file Biome and
scoped diff clean; the nine source/test hashes supplied match the inspected
evaluator, lifecycle/shared/settings, DB booking test, staff availability/test and
new test helper. These are sibling-reported executed source checks, not this
checkpoint worker's independent rerun. API/barrel/registration and current combined
compiler/H01/H02 remain root-owned. Full hold/confirm/all-six lifecycle extraction
is newly assigned design-only, with no edits begun at this checkpoint.

## 3. Required coordinator continuation

1. Collect sibling frozen packets and independent approval-preflight review;
   resolve actionable findings, then run the one current combined compiler and
   focused aggregate against the exact current source. Do not run duplicate
   compilers. Latest prior final log
   `/private/tmp/assistant-quote-confirm-stock-types-final.log` contains 78
   imported baseline diagnostics /0 then-owned errors and predates THIS turn's
   approval+booking changes; it is not their type acceptance.
2. Reconcile H01 coverage snapshot and H02 impact packet for the new protected
   booking query and all current shared policy/client/procedure dependencies.
   Historical H01 current /H02 pass35 logs under
   `/private/tmp/assistant-quote-confirm-stock-{coverage,impact}.log` predate this
   turn and must not be reused as current. Preserve planned availability.
3. Update root-owned Brain feature/API/permissions/tasks/checklist and durable
   source report, including sourceRevision finding/fix, booking evaluator changes,
   proof limits and precise hashes. No Brain source is edited by this worker.
4. Complete outer GENERAL signed durable Quote approval inspection/outside
   preflight/final owning transaction orchestration and every entry point,
   including WhatsApp; cancellation/rejection/terminal recovery must avoid this
   pending approval screen path. Internal safe functions are not endpoints,
   authority grants, end-to-end execution or release acceptance.
5. Complete booking typed assistant/native options and all hold/confirm/lifecycle
   operations, persisted same-command recovery, exact originals and actual saved
   client flows. Availability does not reserve capacity or prove payment.
6. Generic Service/Inquiry pickup/delivery requires additive canonical logistics
   storage, commands, proof/privacy/retention and whole-Order completion integration.
   Read-only proposal saved at
   `packages/assistant/evaluations/proposals/2026-10-15-g03-generic-fulfillment-implementation.md`
   SHA `60cfc2a4318536cce0e3e5ddcc5221cf054a8ab64d436839a5121f4adf582018`.
   No prescription/notification/Job table repurposing; no schema edit/migration
   or database command authorized by that proposal.

Gates unchanged: G01 connected QA human-paused; Paystack paused; D04 conditional
12 UNSCHEDULED/fingerprint-bound; E05 activation/restart rejected; G04 six deferred
UNSCHEDULED; S05 seven UNRUN after budget refusal/no retry scheduling; C04 exact
target bounds. No acceptance increment, hidden runner, capability activation,
source contraction, deploy or provider work follows from this checkpoint.

## 4. Current affected Quote aggregate — later checkpoint update

After the coordinator resumed backend verification, this worker ran the actual
current reviewed-decision, pure decision-review, native decision-seam,
reviewed-issue, issue-options and native commerce-quotes suites together:
**97 pass /0 fail /947 assertions, six files, 1.69s**. Log:
`/private/tmp/assistant-quote-approval-current-aggregate.log`. Command used
`env -u DATABASE_URL EWATRADE_DATABASE_URL=postgresql://fixture:fixture@127.0.0.1:1/assistant_source_tests bun --env-file=/dev/null test`
with those six exact file paths. No suite declares module mocks; actual canonical
functions and inert delegates were exercised. No booking test, compiler, database,
provider/network or runtime action ran. All Quote hashes in section 1 remain
current; native `commerce-quotes.ts` SHA
`40a619649a409f42bf7c2aa47cdad9ffca523a5d6bf74e35ee0b5362ee31adb7`,
pure decision test SHA
`29fd7cedd2d5f15de0e32af4607fcb0d8cf276a384aa2200b948010b4a45b21e`.
This supersedes only the earlier legacy Quote aggregate gap; combined compiler,
current H01/H02/Brain and outer orchestration remain pending as above.


## Coordinator verification — final current source checkpoint

- Current six-suite Quote aggregate: **97 passed /947 assertions /0 failures**.
  Log `/private/tmp/assistant-quote-approval-current-aggregate.log`.
- Booking owner: four actual inert suites **55 passed /294 assertions**.
  Independent focused canonical/evaluator/native review:49/253 passes, same
  overlapping source scope; do not add it again to the owner total.
- Actual API router/scope/schema fixture: **10 passed /154 assertions**, run in
  isolation; persistence/transport is inert, not actual HTTP/auth/SQL acceptance.
- Central query-only staff policy: **10 passed /55 assertions**.
- Stock exact-route tests: **17 passed /134 assertions**. Strict path narrowing
  and exact one-key ID checks repair test typing widened by four new routes.
- Final combined165-entry compiler is terminal exit2: **78 imported baseline
  diagnostics /0 owned errors**. Initial102 included22 booking fixture `tx:{}`
  errors and2 route-union assertions, all repaired. The booking fixture now uses
  the existing typed decision transaction as its Proxy target; predicate/projection
  and deny-all-other handlers are byte-identical. Inherited reads, writes and
  nested transaction probes still deny. No casts or production signature weakening.
  Config `/private/tmp/assistant-quote-approval-booking-types-tsconfig.json`;
  final log `/private/tmp/assistant-quote-approval-booking-types-final.log`.
- Eleven owned new/changed files Biome clean. Legacy decision test helper retains
  four pre-existing lint diagnostics and the pre-existing legalAcceptance format
  finding, independently reproduced against the saved baseline. Only the new
  sourceRevision fixture fields were changed/formatted; no whole-file cleanup.
- H01 regenerated with the new exact protected query classified **planned G03**.
  H02 evidence recorded separately below after the final gate run. No whole
  checkout compiler-green or hosted gate acceptance.

The frozen availability lifecycle SHA2edbf405 belongs to this checked source
checkpoint. The assigned worker was released afterward to implement caller-owned
hold/confirm/all-six lifecycle commands; that subsequent source is separate and
not covered by this checkpoint until tested/refrozen. No full booking command,
public Quote orchestration, native, SQL or connected acceptance follows.

### Scope and remaining work

- [x] Actual nonclinical approval outside-TX preflight, final complete target/
  sourceRevision binding and explicit invalid-proof refusal.
- [x] Protected current staff live/unreserved capacity query and canonical whole
  interval/DST/repeated-rule normalization repairs.
- [x] Independent review and focused current source/type/lint verification.
- [ ] Complete shared GENERAL/channel all-entrypoint composition and full rendered
  Quote transport/history; pending/reject/cancel/terminal remain distinct.
- [ ] Finish caller-owned hold/confirm/all-six lifecycle commands, exact historical
  event/receipt proof and complete typed assistant/native consumers.
- [ ] Implement full disposition and generic Service/Inquiry logistics domains
  under existing schema/connected approval boundaries; proposals are not code.
- [ ] Complete actual persisted/saved/device/concurrent acceptance for all phases.

Overall13/45 (28.9%) unchanged; all existing gates preserved.

Final H02 local gate passes:37 impact records,126 capability and11 procedure rows across the mixed shared checkout. This includes foreign concurrent work and is not owned-only or hosted CI acceptance. H01 regenerated; capability coverage tests6/13 pass.
