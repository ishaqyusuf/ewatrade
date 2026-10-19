# G04 bounded follow-up — source proposal, 15 October 2026

**UNSCHEDULED / DEFERRED.** This is a source inventory and reviewable preparation
packet only. It does not request execution or change a runner, fixture, budget,
threshold, target, grant, capability availability or approval gate. No database,
network, provider, model, runtime or device operation was performed for this
proposal. Root owns shared-source refreeze, checklist and Brain updates.

G04 remains partial/planned/unaccepted. Assistant acceptance stays **13/45
(28.9%)**, with **32/45 (71.1%)** open. A and E have historical bounded evidence;
**the six deferred custody sections are B, C, D, F, G and H**. Packing and archive
source are additional parts of G04, not substitutes for these six sections.

## 1. Evidence and boundaries retained

Authoritative historical sources:

- [Custody source report](../runs/2026-10-12-g04-custody-move.md) and
  [coordinator review](../runs/2026-10-12-g04-coordinator-review.md).
- [Packing source report](../runs/2026-10-13-g04-package-transform.md) and
  [independent packing review](../runs/2026-10-13-g04-package-transform-coordinator-review.md).
- [Archive source report](../runs/2026-10-12-g04-catalog-archive.md) and
  [archive review](../runs/2026-10-12-g04-catalog-archive-coordinator.md).
- Root `AGENT_CHAT.md`: budget handoff
  `4f1efe48-72ea-4977-baec-ab45e9aa2ad5`, owner deferral reported in
  `79a1837f-edc4-4156-a0ac-e906188dcc8b`, A reservation `ac914e0e` and E
  reservation `c13dbecc`. Historical agent correspondence is provenance,
  not new authorization.

Historical outcomes, kept separate:

1. E=100 at median201ms failed the20s pre-fixture gate: **UNRUN**, zero section
   transaction events, nothing planned and no fixture writes. This did not prove
   rollback or idempotency. The later slimmer E removed assistant setup that
   its canonical-only test did not use; it was separately reviewed/reserved.
2. Slim E=90 at median201ms passed: **71** child section-transaction query
   events, forced rollback, same key/input returned the same canonical operation,
   changed quantity refused and Store on-hand10→9. Parent audit used four
   statements, found planned fixtures absent and closed its connection.
3. A=80 at median200ms passed after its specific refusal matcher was repaired:
   **51** child section-transaction query events, exact CONFLICT
   `Only 8 Piece can move: on hand 10, reserved 2.`, unchanged proposal count
   and on-hand10, forced rollback and four-query absence audit.
4. Those counts describe the exact13October fixtures; they are **observations,
   not future upper bounds**. Neither proves a successful signed confirmation,
   full authority matrix, valuation with a Book, unrelated-row invariance,
   browser/native flow or G04 acceptance.
5. B/C/D/F/G/H remain deferred and UNRUN. The owner did not authorize a
   lower-latency runner. No alternate host/runner, immediate retry, persistent
   seed or transaction extension follows from this proposal. Shared dependencies
   changed after A/E; old hashes cannot certify current integration.

Keep G01's human pause, Paystack pause, D04 authorization-fingerprint hold,
E05 rejected activation/restart and S05 no-retry condition. No push, deployment,
schema, provider send or real inventory operation is included.

## 2. Six deferred sections: exact source scope and historical budget

Current source:
`apps/api/src/assistant/general-stock-custody.integration-check.ts`,
`general-stock-custody.integration.test.ts` and
`general-stock-custody-runner-tools.ts` in the same assistant directory.

Every section has independent fixture state. Context sections use one synthetic
QA Tenant, one adult Owner user and membership, active Store, optional current
legal acceptance, synthetic Session and conversation. The exact current
`getActiveTenantForUser` result supplies context. The confirming Owner is also
the staff target; this is not a non-owner target-revocation scenario.

`balanceFixture` creates a Product with the canonical
`createSimpleCatalogItemInTransaction`, reads its exact Offering/unit and creates
a Store `SHARED_POOL` source with **on-hand10, reserved2, movable8**. Each section
owns a new Product/source; no section depends on a previous rolled-back section.

The table's estimates/budgets are the13October handoff, **static and unmeasured
for the deferred sections**, with20–25% stated estimate margin. They are not
reapproved or lowered here. Let `m` be a future invocation's own fresh five-ping
median. Current gate requires `Math.round(budget × m) <= 20_000` before IDs/writes.

| Deferred section | Exact current assertions/work | Historical estimate → budget | Projection at historical201ms; median needed for20s |
|---|---|---|---|
| **B** `sectionInjectedFailure` | Draft/review assignment4; confirm through completion-update failure injector; require `Injected receipt failure`; Store stays10 and staff balance stays absent | ~150 → **185** | 37,185ms; approximately≤108.1ms |
| **C** `sectionConfirmReplay` | Draft/review assignment4; confirm inventory receipt; Store6/staff4; same signed decision returns equal receipt; Store stays6 | ~168 → **210** | 42,210ms; approximately≤95.2ms |
| **D** `sectionCombinedDrift` | Canonical form assignment3; draft/review another1; canonical form return1 changes **both** source and target; confirmation rejects; Store stays8 | ~177 → **220** | 44,220ms; approximately≤90.9ms |
| **F** `sectionAuthorityLoss` | Draft/confirm2; draft pending1; capture completed proposal and operation count; set actual membership roleCASHIER; pending and completed decisions each require FORBIDDEN; restore actual prior role; completed row and operation count unchanged; Store8 | ~239 → **300** | 60,300ms; approximately≤66.7ms |
| **G** `sectionDuplicate` | Draft/review assignment1; read exact proposal idempotencyKey; two `Promise.allSettled` decisions; exactly one operation with that key; Store9/staff1 | ~168 → **210** | 42,210ms; approximately≤95.2ms |
| **H** `sectionReturn` | Canonical form assignment5; exact staff source; draft/review return5 to same Store; confirm receipt title `Stock returned`; Store10/staff0 | ~176 → **220** | 44,220ms; approximately≤90.9ms |

At the historical201ms median **none can pass the existing20s gate**; their
projections also exceed transaction30s. Historical S05 diagnostic207ms is not
a current G04 measurement or permission. A/E counts cannot be subtracted into a
proven full signed-section bound. Today's shared principal/privacy/authority/
proposal/command graph needs fresh count derivation; no measurement-only bypass
is proposed. Stateful confirmation/replay must not be split into persistent
fixtures merely to make each transaction appear smaller.

## 3. Source findings to resolve or explicitly bound before scheduling

These are review findings, **not fixture edits**:

- **D can false-pass on an unrelated refusal.** Its current assertion is bare
  `.rejects.toThrow()` after the form drift, followed by Store8. A session,
  legal or authority failure could satisfy both without proving a stale signed
  review. This repeats the kind of false-positive A repaired historically.
  Before D is a meaningful acceptance unit, its owner must specify/review the
  intended stale code/message and invariance evidence. No matcher or source is
  changed here. Combined drift still cannot prove target-only drift.
- **B's stated rollback coverage is narrower than every row.** It explicitly
  checks the injected failure message, source quantity and absent staff balance.
  It does not compare stock-operation/movement/valuation rows or proposal state
  before/after the injected completion failure. Parent final fixture absence
  cannot by itself prove per-command atomicity before the outer rollback.
- **C checks equal receipt and quantities**, not an explicit keyed operation
  count or persisted cross-transaction replay. G separately asserts exactly one
  keyed operation. Do not attribute G's assertion to C or broaden either to
  durable/concurrent recovery.
- **F's actual invariance checks** cover the completed proposal row, tenant
  operation count and Store quantity. They do not compare the pending row,
  staff quantity, every valuation row or unrelated custody. Actual prior role
  is restored in `finally`; outer rollback remains the final safety boundary.
- **G is sequential under the savepoint mutex**, despite Promise.allSettled.
  It does not establish independent-connection serialization, contention or
  command commit race recovery. Rejected duplicate promises are not inspected
  individually; the one-operation/delta assertions are its concrete evidence.
- **H's target remains the confirming Owner.** It does not cover a departed
  holder, non-owner target, absent destination creation or removal of Store
  access. Its title and balances prove less than full receipt/original identity.

Before any later reservation, the root should require exact current scope,
reviewed complete budget with margin and an honest list of remaining gaps. A
new source freeze or offline green result alone cannot lift the deferral.

## 4. Existing runner protections and unchanged limits

Only the existing `scripts/qa-assistant-stock-custody.mjs` is in the historical
execution design. No alternate launcher or runner is proposed. It requires
`--run`, an explicit unique section list and strict integer budgets for exactly
those sections; there is no default. Invalid/duplicate/unrequested budgets,
extra fields and values over500 refuse. No command is scheduled by this packet.

| Boundary | Current source behavior |
|---|---|
| Profile/target before network | Explicit root `.env.local`; Production reference required and excluded; reused diagnostic `resolveTarget` validates PostgreSQL protocol, allowlisted query parameters, `pg` effective host/database and explicit5432; exact authorized `ewatrade_qa_v1` on `ep-royal-dew-awnlogem-pooler.c-12.us-east-1.aws.neon.tech` |
| Child independently rechecks | Launcher marker/verified local profile; unconnected actual pg.Client effective host5432/database; then runtime `SELECT current_database()`; ambient `PG*` and DATABASE_URL dropped |
| Process-only test identity | Random run marker and32-byte signing key, `ASSISTANT_REHEARSAL_MODE=true`, synthetic identities/session. Context sections temporarily override only the custody manifest entry's rollout with exact prior value restored; no running server configuration or real session is altered |
| Preflight/client | Five SELECT1 pings after current_database; fixture-owned single warm connection; connect20s/query25s; beforeAll40s. The event counts exclude preflight |
| Per section | Budget×fresh median≤20s before planned IDs/transaction; independent Serializable transaction; maxWait10s/timeout30s; SET LOCAL statement20s and lock10s |
| Per command | Savepoint success releases; failure rolls back to its own savepoint and releases. Mutex serializes callbacks; nested/batch transactions refused. Callback-specific isolation/timeout options are not applied; outer transaction governs |
| Completion | Own Rollback sentinel must be observed at stage`rollback`; no-error without sentinel is NOT_ROLLED_BACK. Failed/UNRUN counts are partial and never budgets; first non-completion stops requested sequence and later sections emit UNRUN |
| Child/whole lifecycle | One sequenced Bun test95s, child work100s; SIGTERM then at3s SIGKILL within cancellation5s; reserved audit15s; absolute whole120s with shared cleanup/backstop. Late exit cannot start work after cancellation |
| Audit/cleanup | Audit only after confirmed child exit; otherwise CHILD_UNCONFIRMED, failed run and unknown absence. Killed/timed-out child remains failed even if audit is clean. Audit connect10s/query5s, local15s envelope with final cleanup reserve≤1s; expired work cannot start later queries |

Root13October offline review cleared the historical target/lifecycle/savepoint/
plan/late-audit repairs. This proposal inspects current source; it does not rerun
those tests or recertify them against changed dependencies. Report current code
rather than superseded prose: the actual backstop is **120s**, not the earlier
report paragraph's122s. The absolute ceiling includes cleanup/audit; it is not
permission to extend transaction30s or borrow audit time for fixture work.

No implicit fallback is allowed when the selected local profile targets another
database. Do not derive credentials/URLs or change profiles, targets, current
users, grants or budgets to fit the guard. Current schema/generated client and
deterministic QA text-screening prerequisites must be re-reviewed privately;
never log secrets or enable live screening/provider calls to fix a test.

## 5. Rollback, planned evidence and absence scope

The launcher exclusively creates a plan with its own marker/header. Each section
appends section/Tenant/user/Store UUIDs **before any write**. Strict parsing refuses
missing/truncated/malformed plans, invalid identifiers, unknown sections and
extra keys. An intact header without entries means nothing was planned; it
does not masquerade as rollback proof for a started fixture.

After confirmed child exit the parent uses four fixed read-only counts:

1. Tenant IDs from the plan.
2. User IDs from the plan.
3. Store IDs from the plan.
4. StockBalanceSource rows for planned Tenant IDs.

Four zeros prove **planned fixture absence only**. They do not checksum unrelated
rows, saved business/auth/chat data, every child table or Finance valuation.
Child Prisma query-event counts include setup/savepoints/section work but exclude
driver BEGIN/ROLLBACK not emitted as events, preflight and these four parent
audit statements. Keep count scopes separate.

Timeouts, unknown termination, audit/parse/cleanup errors, leftover rows, missing
metrics and changed fingerprints are failures/stops. Preserve plan evidence on
failure, report safe codes and unknown absence honestly, and do not retry or
delete fixture data as an assumed repair. Successful cleanup may remove its owned
temporary plan. No persistent fixture/account cleanup or restore procedure is
authorized here.

## 6. Full G04 work still outside these six custody sections

- **Unrepresented custody cases:** target-only drift with unchanged source;
  creation/change of an absent target; target eligibility revoke for a non-owner;
  actual multi-connection confirmation concurrency; current actor/Store revocation
  across independent requests; departed-holder return; valuation with a real Book;
  immutable original receipt identity and unrelated-row invariance. Current source
  explicitly marks the first four UNRUN. Completed replay rechecks fresh actor/
  domain authority then returns stored receipt; it does not re-run target checks
  for a new effect or move stock again.
- **Packing:** `stock_package_transform` has source/offline extraction review,
  exact source-factor÷target-factor derivation with permitted scale, both endpoint
  fingerprints/revisions/configuration, conserved quantity and reserved floor.
  Actual signed confirmation/replay/receipt rollback, broader refusal immutability,
  stock/configuration races and connected valuation remain UNRUN. Custody runner
  A–H does not execute transform. Loss remains a separate workflow; no linked
  loss adjustment is created by packing.
- **Archive:** repaired source distinguishes ACTIVE selling units from DRAFT
  leftovers and rejects variant/child overlap. Signed current-authority decisions,
  reservation concurrency, stale/immutable original outcome and saved client
  Open/Close remain open. Custody runner cannot accept archive.
- **Reservations and bounded bulk/configuration:** existing capability inventory
  still classifies `inventory.*Reservation` and `inventory.reserveOffering` under
  planned G04. Deletion, more than20 archive targets, multi-Product destructive
  changes and large/uncertain import actions retain explicit form handoff. Source
  delivery for custody/packing/archive does not accept every G04 subrequirement.

## 7. Missing client evidence

Custody and packing manifest entries currently declare **dashboard only,
planned**, Owner/Admin/Manager ceiling plus current inventory/Store authority.
No native editor/source certification or live rollout is inferred from ordinary
inventory forms. Archive has native change-editor source and exact Product route;
source parity is not actual device acceptance.

Required bounded dashboard and native evidence, separately gated:

- Saved proposal/chat: exact staff/Product/Store names, same-name identities,
  fresh authorized choices, selected missing/revoked target, cached/pending reopen,
  paused/denied/empty states and scope changes, without earlier staff disclosure.
- Edit through ordinary editProposal→refreshed signed review→separate explicit
  confirmation; reason/quantity validation and no raw ID entry. Packing endpoints
  remain fixed; target quantity is derived exactly, without rounding or model input.
- Confirm once/replay, rollback/refusals and exact original inventory operation
  or Product Open/Close while preserving the selected chat/unsent draft. No success
  claim from a transient card or component-only render.
- Actual Owner/Admin/Manager/Cashier and scoped/revoked Store journeys; original
  audit authority on reopen; cross-Store withholding/handoff without silently
  switching business or Store. Scope/role read-only screens cannot prove writes.
- Real device/layout/accessibility, pending network cancellation and authenticated
  runtime source validation. Static source/observer/mock-link tests establish
  narrower behavior and must remain labelled as such.

No browser/device execution or current runtime restart is scheduled. Preserve all
existing client and G01/E05 approval prerequisites rather than activating a
planned action to produce acceptance evidence.

## 8. Current dependency inventory for root refreeze

Root must capture final full hashes after Phase6/shared work, review changed
hunks and compare before/after any separately scheduled execution. This table
is not a hash freeze or a claim the13October packet is unchanged.

| Area | Primary exact paths |
|---|---|
| Runner/target/environment | `scripts/qa-assistant-stock-custody.mjs`; `scripts/qa-staff-activity-latency.mjs`; `scripts/database-profile.mjs`; `scripts/environment-profile.mjs`; `apps/api/src/assistant/general-stock-custody-runner-tools.ts`; its test; `apps/api/src/assistant/general-stock-custody.integration.test.ts`; `apps/api/src/assistant/general-stock-custody.integration-check.ts` |
| Custody source/canonical | `apps/api/src/assistant/general-stock-custody.ts`; its test; `packages/assistant/src/general/stock-custody.ts`; its test; `packages/db/src/queries/inventory-custody-transfers.ts`; `packages/db/src/queries/inventory-finance-locks.ts`; `packages/db/src/queries/inventory-transfer-review-locks.ts`; `packages/db/src/queries/finance/valuation-relocations.ts`; actual catalog fixture and service-assignee transitive imports from current queries index |
| Packing/archive | `apps/api/src/assistant/general-stock-transform.ts`; its test; `packages/assistant/src/general/stock-transform.ts`; its test; `packages/db/src/queries/inventory-operations.ts`; `packages/db/src/queries/finance/valuation-transformations.ts`; `apps/api/src/assistant/general-catalog-archive.ts`; its test; `packages/assistant/src/general/catalog-archive.ts`; its test; `packages/db/src/queries/catalog.ts` |
| Signed dispatcher/current authority | `apps/api/src/assistant/general-proposals.ts`; `apps/api/src/assistant/general-context.ts`; `apps/api/src/assistant/general-actions.ts`; `apps/api/src/assistant/general-rollout.ts`; `apps/api/src/assistant/channel-principal.ts`; `apps/api/src/assistant/proposal-security.ts`; `apps/api/src/schemas/inventory.ts`; current auth/legal/privacy/tenant-context and canonical schema/generated client dependencies |
| Shared declarations/source gates | `packages/assistant/src/general/contracts.ts`; `packages/assistant/src/general/prompt.ts`; `packages/assistant/src/capabilities/manifest.ts`; `packages/assistant/src/capabilities/inventory.ts`; `packages/assistant/src/capabilities/COVERAGE.md`; `packages/db/src/queries/index.ts`; root `package.json`/`bun.lock`; package exports and installed Prisma/pg/tRPC versions |
| Dashboard/client | `apps/dashboard/src/components/general-assistant/general-stock-custody-editor.tsx`; its test; `apps/dashboard/src/components/general-assistant/general-stock-transform-editor.tsx`; its test; `apps/dashboard/src/components/general-assistant/general-catalog-archive-editor.tsx`; `apps/dashboard/src/components/general-assistant/general-proposal-editor.tsx`; `packages/assistant/src/general/staff-activity-target.ts`; current protected tenant/options query and original inventory audit consumers |
| Native/archive originals | `apps/mobile/src/components/mobile/assistant/general-change-editor.tsx`; `apps/mobile/src/components/mobile/assistant/native-change-values.ts`; `apps/mobile/src/components/mobile/assistant/general-proposal-editor.tsx`; `apps/mobile/src/components/mobile/assistant/general-model.ts`; current Product/inventory original route consumers |

Shared manifest/contracts/context/actions/proposals, Inventory command seams,
native registry/client and Finance dependencies have changed under other work.
Preserve all foreign hunks and declared ownership. In particular packing's
integration changed the old custody/S05 freeze; later channel-principal and
recovery/privacy changes require current review. Old focused tests remain
historical evidence, not certification of changed paths. Root should locate and
hash current impact records/reports separately; this packet adds no classifications.

## 9. Preparation checklist and next safe action

- [x] Identify all six deferred sections and their exact current assertions.
- [x] Preserve static budgets, no-retry/alternate-runner deferral and A/E scope.
- [x] Inventory guard/lifecycle/rollback/absence limits and source review gaps.
- [x] Inventory full G04/client gaps and shared refreeze dependencies.
- [ ] Root final dependency hashes, ownership and affected source review.
- [ ] Separately reviewed assertion/count-budget evidence for an exact section.
- [ ] Required human authorization for any different host/runner; currently absent.
- [ ] Explicit new bounded coordinator reservation; currently absent.
- [ ] Connected signed/client/remaining G04 acceptance; still unproven.

The completed unblocked action is proposal preparation. Continue other authorized
source work and root review/refreeze. Do not run the historical suite or silently
select a faster host, weaker case, smaller budget or longer timeout. Even a later
passing custody section remains evidence for that exact scope, not acceptance
of all G04 work.
