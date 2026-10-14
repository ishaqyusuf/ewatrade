# G04 packet 2a: assistant custody move (source handoff)

Status: source authoring under coordinator release 725c7e54. Planned
dashboard capability; not accepted, not promoted, no connected run.

## What it does

`inventory.custody.move` (action `stock_custody_move`) drafts a signed,
reviewed custody move inside the active Store, limited to two directions:

- **Assignment**: Store custody → a staff member. The target must be a
  current eligible member under the canonical service-assignee rule
  (`serviceAssigneeWhere`: active, eligible role, access to this Store),
  checked freshly at review and before any new effect at confirmation. A
  completed replay checks only fresh actor/domain authority and returns the
  stored receipt; it does not re-check the target. Identity is the exact
  saved user ID, never a name.
- **Return**: a staff member's custody → the same Store. Allowed even if the
  holder has since left (the remedy for revoked staff); the review then names
  them "a former staff member".

Refused, with a reason: Store → Store (already in Store custody), staff →
the same staff (no-op), staff → another staff ("return it first, then assign
it"), and session or transit sources (their own closeout/transfer
workflows). "Self target" is read as a no-op target equal to the source
custody. Assigning stock to the confirming manager is allowed when they are
an eligible assignee; say if that should be refused.

## Authority and scope

- Tenant, Store and actor come from fresh trusted context
  (`requireGeneralScope`), never from the model.
- `assertCustodyAccess` runs at review, at lock and at confirmation. It
  requires an inventory-managing role (`canManageSalesOperations`), that the
  custody Store is the active Store and in the member's Stores, and, for
  scoped staff, Store access plus a `stock` permission there.
- A scoped member whose business role is below manager is refused even with
  a stock-capable Store assignment, matching the existing assistant transfer
  rule and the manifest policy (Owner, Admin, Manager).
- A source outside the Tenant or the active Store returns the generic
  unavailable message, with no disclosure.

## Review binding and drift

The signed review digest covers:
- kind, Store, source balance ID and revision, and source custody;
- Product, variant, unit, configuration version and factor;
- staff user and membership;
- quantity, canonical quantity, on hand, reserved, movable, and before/after
  for both holders;
- the target balance as `{state: "absent"}` or
  `{state: "present", id, revision}`.

Any change makes the draft stale. That includes source revision, reserved
quantity, the target's revision, and a target created after review.

- **Absent target:** at confirmation an absent target is pinned with
  `expectedTargetRevision: 0`. The command creates it at revision 0, and the
  canonical check refuses a balance created and changed since review.
- **Quantity:** at most on hand minus reserved, enforced at review and at the
  locked re-review. The canonical `postCustodyMovement` also refuses
  (`INSUFFICIENT_STOCK`) when the source would fall below its reserved
  quantity. (Corrected: the first handoff wrongly said it checks on hand
  only.)

## Confirmation

`prepareExecution` and `validate(lock)` first read the review to learn the
target ID. Then `lockInventorySourcesForReview` locks the financial Store
first and then the sorted source/target rows (the command's own order), and
the review is read again. `moveInventoryCustodyInTransaction` then runs
inside the same proposal transaction with:
- `clientOperationId` = the proposal key and `source: "assistant"`;
- the expected source and target revisions;
- target type and reference derived from the review.
Its canonical locks, revision checks, idempotency payload hash and
relocation valuation are unchanged. There is no nested transaction and no
direct balance write.

The receipt is `inventory` with the stock operation ID and Product ("Stock
assigned" / "Stock returned").

## Paths

New:
- `packages/assistant/src/general/stock-custody.ts` (action schema) and its
  `.test.ts`
- `apps/api/src/assistant/general-stock-custody.ts` (adapter and pure policy
  `custodyMoveKind`) and its `.test.ts`
- `apps/api/src/assistant/general-stock-custody.integration-check.ts` (UNRUN)
- `apps/dashboard/src/components/general-assistant/general-stock-custody-editor.tsx`
- `packages/assistant/impact/2026-10-12-g04-custody-move.json`, and this
  report

Shared seams (exact hunks are in the handoff):
- `packages/db/src/queries/inventory-custody-transfers.ts`: one hunk
  extracting `MoveInventoryCustodyInput` and
  `moveInventoryCustodyInTransaction`. The wrapper still uses
  `TRANSACTION_OPTIONS`; the body is re-indented, otherwise identical.
- `packages/assistant/src/general/contracts.ts`: import, union entry and one
  summary case (required by the exhaustive summary switch).
- `packages/assistant/src/capabilities/manifest.ts`: the
  `inventory.custody.move` entry. It changes the manifest hash that the S05
  packet froze.
- `packages/assistant/src/capabilities/inventory.ts`: removed
  `inventory.moveCustody` from the G04 planned list (transforms stay
  planned).
- `apps/api/src/assistant/general-actions.ts`: import and registry entry.
- `packages/assistant/src/general/prompt.ts`: one line.
- `apps/dashboard/src/components/general-assistant/general-proposal-editor.tsx`:
  import and dispatch branch. Its 15 pre-existing formatter differences were
  left untouched.
- `packages/assistant/src/capabilities/COVERAGE.md`: regenerated by the
  generator only. The generator now runs clean.

Deviation from the request: the pure policy lives in the API adapter, not in
`stock-custody.ts`. The `@ewatrade/assistant/general/stock-custody` subpath
is not a package export, and `packages/assistant/package.json` was not
released.

## Checks run (12 Oct 2026, uncommitted source, no database connection)

- `general-stock-custody.test.ts`: 9 pass, 42 assertions.
  - Policy matrix.
  - Review lines for both directions: on hand, reserved, movable, both
    holders, and a new custody balance.
  - A return after the holder left.
  - Quantity above movable and above the unit scale.
  - Ineligible or revoked staff; foreign and other-Store sources without
    disclosure; staff→staff, Store→Store and session refusals.
  - Cashier, wrong active Store and scoped cashier refused at review, lock
    and prepareExecution.
  - Drift in source revision, reserved, target revision and created target
    changes the digest.
  - The locked confirmation calls the canonical command with exact input
    (actor/Tenant from scope), and a replay sends identical input.
  - Absent target pinned at 0; a return targets Store custody.
- `packages/assistant/src`: 234 pass, including the strict action schema.
- API `src/assistant`: 302 pass, including capability coverage after
  regeneration.
- Dashboard `general-assistant`: 38 pass.
- Existing custody db tests (remaining coordination, closeout finalization
  and review): 40 pass, through the native `moveInventoryCustody` wrapper.
- Scoped `tsc`: no errors in packet files for api, dashboard, assistant and
  db.
- Coverage generator: current. Impact gate: see the handoff for the final
  result.

## Not done / limits

- **Mismatched idempotency and duplicate confirmation:** proven only by the
  canonical command's payload hash. The adapter test shows that a replay
  sends identical input; a mismatched key is not exercised offline. The
  signed verifier covers replay and role loss but is UNRUN.
- **Signed rollback verifier:** UNRUN. Its cases are refusal over movable
  quantity, injected receipt failure rollback, confirm and replay, form-move
  drift going stale, role loss → FORBIDDEN, and return to the Store.
- **Mobile native editor:** not done (A04 pattern, later).
- **Packing transforms:** not in this packet (G04 packet 2b).
- **Session custody:** not in this packet.
- **Browser and native acceptance:** none.
- **Model drafting by name:** needs an exact staff user ID. No assistant read
  lists eligible custody staff, so the editor's picker (canonical assignee
  list; the server re-checks Store eligibility) is the reliable path.

## Review repairs (18b0c2a9, 12 Oct 2026; refrozen, not run)

1. **Central authority.** `apps/api/src/assistant/general-context.ts`
   `domainAccess` had no `inventory.custody.move` entry, so
   `assertCapabilityAuthority` refused it. One released hunk was added after
   `inventory.transfer.cancel`: `"inventory.custody.move": (tenant) =>
   assertCanManageInventory(tenant)`. The scoped `tsc` filter had missed the
   TS2741 it raised; that file is now in the typecheck filter. New test using
   the real `assertGeneralActionAuthority`:
   - permitted: Owner/Admin/Manager (legacy), and a scoped manager with
     MANAGER or OPERATOR Store role;
   - refused: Cashier, Operator, a scoped Store CASHIER role, a revoked
     assignment, no assignment, suspended staff access, and the mobile client;
   - still planned: `assertGeneralAction` refuses (no promotion).
   With the mapping line removed, the test fails (negative control).
2. **Editor Store scope.** The staff list now comes from
   `serviceAssistantIntake.options` (protected `services.assignees`
   intersected with the canonical current-Store `serviceAssigneeWhere`).
   - It is bound to fresh `tenant.current` (Tenant/Store/member key remounts
     the form) with `gcTime 0` and `refetchOnMount: "always"`.
   - A list whose `storeId` differs from the active Store shows as
     unavailable.
   - A drafted identity outside the current eligible list is never offered;
     Save stays disabled until an eligible ID is chosen.
   - Loading, error and empty states offer nobody.
   - The options read also returns a bounded service-catalog page that the
     editor ignores, so it is extra load, not extra authority.
   - `general-stock-custody-editor.test.tsx` (released 47b70b76): 7 pass,
     static-render source evidence (not browser acceptance). It covers the
     eligible save, same-name distinct identities, a revoked/absent drafted
     identity blocking save, an old cached list for another Store,
     loading/error/empty, scope key changes, and a return needing no staff
     choice.
3. **Review lines** now name the Store ("Give 5 crate to amina at Wuse.",
   "Wuse Store stock …"). The Store was already bound in the digest.
4. **Verifier** (still UNRUN):
   - Role changes restore the member's actual prior role, read first.
   - Added cases: replay after a completed confirmation under role loss
     (receipt or FORBIDDEN, never a second movement); target-only drift via a
     form return; actual mismatched idempotency through the canonical command
     (same key + same input returns the original, different input → "already
     used with different input"); and parallel duplicate confirmation (at most
     one recorded movement).
   - Declared UNRUN inside the verifier: absent-target creation drift with a
     second person, target eligibility revoke with a non-owner target, and
     truly cross-connection concurrency. The offline adapter tests cover the
     first two at the review/digest level.

## Review repairs 2 (069f3a48, 12 Oct 2026; refrozen, not run)

1. **Editor reads are owned by each editor opening.** `tenant.current` and
   `serviceAssistantIntake.options` both go through exported builders
   (`custodyContextRead`, `custodyOptionsRead`). These wrap the canonical SDK
   options with the existing `mountOwnedRead` and a per-mount id from
   `nextReadMount`, plus `trpc.abortOnUnmount`, so closing aborts the
   opening's own requests. Canonical inputs, keys and protected procedures are
   unchanged, and the shared helpers are reused without edits.
   - Both reads are gated by `freshShownRead`: only a read completed by this
     opening counts. A refetch in flight or a cached answer shows loading.
   - New tests use the actual tRPC options proxy and client with a local link
     and real QueryObservers:
     - a pending read closed before revocation is aborted, and the reopened
       editor starts its own request and offers only the new list (the
       revoked drafted person is not eligible);
     - a same-Store staff change while the editor is open shows "checking"
       until the new list arrives;
     - a cached Store context that is refetching is not current.
   - Negative control: the previous wiring fails the first test (no abort
     signal reaches the pending request).
   - Editor tests: 10 pass. This is source/unit evidence, not browser
     acceptance.
2. **Verifier assertions** (still UNRUN):
   - A completed replay under fresh role loss must be FORBIDDEN. The stored
     proposal row stays identical, and the stock-operation count and balances
     are unchanged.
   - The drift section is relabelled combined source+target drift, and
     target-only drift is declared UNRUN.
   - The duplicate section reads the proposal's `idempotencyKey` and asserts
     exactly one stock operation with that `clientOperationId`, with exact
     one-move deltas (Store −1, staff +1). Cross-connection concurrency stays
     UNRUN.
3. **Report correction.** Completed replay checks fresh actor/domain
   authority (`assertGeneralActionAuthority`) and returns the stored receipt
   before any custody adapter validation. Target eligibility is re-checked
   only before new effects. The earlier mocked identical-input "replay" is
   not replay evidence and is withdrawn as such.

## Guarded runner (source authored under c13e682a; frozen, NOT run)

The earlier assumed seven-section table, including "E fits", is removed:
it was an unmeasured assumption and is superseded by this section.

Authored paths:
- `scripts/qa-assistant-stock-custody.mjs`: the launcher. Run with
  `bun --env-file=/dev/null`, so it can import the tested TypeScript tools.
- `apps/api/src/assistant/general-stock-custody-runner-tools.ts`: pure tools,
  with no connection, environment loading or side effects on import.
- `apps/api/src/assistant/general-stock-custody-runner-tools.test.ts`: offline
  tests, 9 pass.
- `apps/api/src/assistant/general-stock-custody.integration.test.ts`: the
  gated connected file. Under normal discovery it only skips.

**Launcher**
- Refuses without `--run` and an explicit `--sections` list with a reviewed
  `--budgets` statement count for every section. There is no default.
- Its guard runs before any network work and reuses the latency diagnostic's
  `resolveTarget` unchanged: explicit root `.env.local`, `applyDatabaseProfile`
  Production exclusion, parameter allowlist, pg-parsed host/port/database,
  port pinned to 5432, `/ewatrade_qa_v1`.
- The child environment drops ambient `PG*` and `DATABASE_URL`, and sets:
  - the pinned URL;
  - a fresh run marker;
  - sections, budgets and the plan file;
  - a synthetic random 32-byte signing key;
  - `ASSISTANT_REHEARSAL_MODE=true`.
- Whole run 120 s:
  - child work 100 s, then SIGTERM, then SIGKILL after 3 s;
  - a 5 s cancellation window, after which the launcher stops waiting;
  - a reserved 15 s read-only audit.
- The audit reads the planned IDs from the child's plan file and counts the
  Tenant, user and Store rows, plus custody rows of those Tenants, with
  fixed SQL over one bounded connection.
- An audit timeout or error fails the run. Zero rows proves only that the
  fixture is absent; unrelated rows are not checked. Child exit is never
  taken as proof of rollback.
- The URL and credentials are never printed.
- Self-test: 15/15 pass, network none. It covers argument refusals, the
  explicit section+budget path, target pinning, the Production-equivalent and
  routing-override refusals, the child environment dropping ambient PG
  settings, the deadline arithmetic, a missing plan file, and audit timeout
  as failure.

**Integration file**
- Refuses unless the launcher marker is present and the pinned target is
  exact (`DATABASE_PROFILE_VERIFIED`, `DEV_PROFILE=local`, host, 5432,
  `/ewatrade_qa_v1`), and checks `current_database()`.
- A fixture-owned client counts every statement (query events) and takes a
  5-ping preflight median.
- For each requested section:
  1. the budget gate (`assertSectionFits`: budget × median ≤ 20 s) runs
     before any transaction;
  2. planned IDs are appended to the plan file before any write;
  3. one Serializable transaction runs (maxWait 10 s, timeout 30 s, `SET
     LOCAL statement_timeout 20s`, `lock_timeout 10s`) with synthetic
     user/terms/Tenant/Owner/Store/session/context/conversation;
  4. the savepoint adapter and receipt-failure injector are applied, and the
     section runs under `withRolloutOverride(entry, "source")` (exact prior
     value restored);
  5. the rollback sentinel ends the transaction.
- Each section reports outcome, stage, statements and `statementsComplete`.
  A failed or unrun section's count is partial, never a budget.

**Tools, tested offline**
- Savepoint adapter: success releases; failure rolls back only its own
  writes; an injected receipt failure rolls back the movement and the
  section continues; concurrent callbacks are serialized; a nested
  transaction is refused without deadlock and the stack recovers; batch
  transactions are refused.
- Rollout override restores on success, on throw, and when absent.
- Deadline cancels.
- Budget gate refuses with no budget, an over-budget projection or infinite
  latency.
- Section outcomes never overstate; errors are reduced to codes.
- Audit verdicts fail on timeout, error or leftover rows.
- Savepoint limits: callback isolation/timeout options are not applied, a
  savepoint is not a separate transaction, and serialized duplicates are
  sequential, not concurrency evidence.

**First section proposed: E** (canonical idempotency; no signed proposals).

Conservative statement derivation, unmeasured:

| Part | Statements |
|---|---|
| Transaction and SET LOCAL | ~5 |
| Synthetic people, Store, session, context, conversation | ~30 |
| Fixture item via `createSimpleCatalogItem` (with savepoint) plus balance | ~25 |
| Three canonical custody calls (first full ~25 including valuation and savepoint; two early-returns ~6 each) | ~37 |
| Reads | ~3 |
| **Total** | **~100** |

Proposed budget: `--budgets E=100`. At the single ~207 ms diagnostic
observation, the projection is ~20.7 s, which is over the 20 s gate, so E
would stop UNRUN before any transaction unless the preflight median is at
most 200 ms.

Stop condition: gate refusal, any failure, or audit failure ends the run.
There is no retry, no automatic next section, and no longer limits. No
other section is proposed until E completes with a measured count.

## Verifier sections and budget plan (after review c2984ee1; source only, UNRUN)

`general-stock-custody.integration-check.ts` now exports eight independently
callable sections. Each creates its own synthetic Product and Store balance
(on hand 10, reserved 2) and depends on no other section's state:
- **A** refusal over movable quantity (no proposal stored);
- **B** injected receipt failure → no movement, no custody balance;
- **C** confirm, then replay returns the same receipt;
- **D** combined source+target drift → stale (target-only is UNRUN);
- **E** canonical idempotency (same key+input → same operation; different
  input → refused);
- **F** pending and completed proposals refused under fresh role loss, with
  the stored proposal, operations and balances unchanged;
- **G** duplicate decision → exactly one operation with the proposal key, and
  one-move deltas (sequential under a serialized adapter; cross-connection
  concurrency UNRUN);
- **H** return to the Store.

`custodyVerifierSections` maps A–H for a runner. `verifyStockCustodyComposition`
still runs all eight in order for compatibility.

Budget and counts (current; supersedes earlier paragraphs):
- **Gate.** Only the gated first section E is proposed, with
  `--budgets E=100`. Before any transaction, a section runs only if its
  reviewed budget × the run's own 5-ping preflight median is at most 20 s.
  Otherwise it stops UNRUN. There is no unbudgeted "measurement pass" and no
  automatic next section.
- **Two separate counts.**
  - The child's count is Prisma query events for the section's transaction:
    SET LOCAL, setup, savepoints and section work. It excludes driver-level
    BEGIN/ROLLBACK not emitted as query events, and the preflight.
  - The launcher's audit reports its own count (4 fixed statements).
- **Observed counts.** A completed section's count is an observation, not a
  guaranteed future upper bound; any later budget adds margin. Counts from
  failed or unrun sections are partial and never used as budgets.
- **Helpers.** The savepoint adapter, receipt-failure injector, rollout
  override, lifecycle and audit already exist in the reviewed runner tools,
  with offline tests. Nothing connected follows from offline evidence.

## Runner repairs (review 94db6361; refrozen, NOT run)

The lifecycle now lives in the tested tools (`orchestrateRun`, `runAudit`,
`parsePlan`, `parseRunnerArgs`, `childEnvironment`, `runnerDeadlines`,
`assertEffectiveTarget`, `createSectionSequencer`). The launcher only wires
real processes and clients.

1. **Bounded lifecycle.**
   - A `withDeadline(totalMs)` ceiling covers child work, signals, plan
     reading, audit and cleanup.
   - The audit's `client.end()` is bounded and a hanging end is destroyed.
   - The launcher adds a backstop `process.exit(1)` at 122 s, kills any live
     child and exits explicitly.
   - The audit runs only after the child's exit is confirmed. A stuck child
     gives `CHILD_UNCONFIRMED`, with fixture absence unknown, a failed run and
     no audit; a killed child is audited but the run still fails.
   - Plan evidence is kept whenever a run does not pass.
2. **Fail-closed plan evidence.**
   - The launcher pre-creates the plan file (exclusive create) with a
     `{"plan":"g04-custody","marker"}` header.
   - `parsePlan` refuses a missing file, a truncated last line, a malformed
     line, a wrong or missing header, unknown sections, non-UUID IDs and
     extra keys.
   - A header with no entries means nothing was planned (so nothing was
     written).
3. **Child target.**
   - Before connecting, the child checks the protocol, the parameter
     allowlist, and the effective host/port/database of an unconnected
     `pg.Client`.
   - The child environment drops every `PG*` key and `DATABASE_URL`.
   - The launcher keeps the Production exclusion.
4. **First-failure stop.** `createSectionSequencer` reports later sections
   UNRUN with no transaction started, and the child runs `bun test --bail`.
5. **Strict budgets.** Duplicates, extra `=`, unknown or unrequested keys,
   leading zeros, non-integers and values over 500 are refused. The example
   is `E=100`.
6. **Honest outcomes.**
   - `sectionOutcome` reports completed only with `rolledBack: true` at stage
     `rollback`. Otherwise it is failed (`NOT_ROLLED_BACK`) or unrun, and only
     completed counts are usable.
   - Count scope is the child's Prisma query events for the section
     transaction. It excludes driver-level BEGIN/ROLLBACK not emitted as
     query events, the preflight, and the launcher's audit, which reports
     its own count (4).
   - Measured counts are observations, not upper bounds; any later budget
     adds margin.
   - `withDeadline` still rejects with DEADLINE when cancellation throws.

Offline evidence:
- Tools tests: 21 pass, 97 assertions. They cover:
  - strict arguments;
  - the effective-driver target (a `?host=`, `port`, `dbname`, port 6543,
    other database or protocol all refused using real unconnected
    `pg.Client` configuration);
  - all PG keys dropped;
  - plan reader failures;
  - the audit with a hanging end bounded under 1.5 s and destroyed, a
    hanging connect timing out, leftovers failing, and nothing planned with
    no client;
  - lifecycle: a clean pass, a failed child, a stuck child (SIGTERM →
    SIGKILL, never audited, `CHILD_UNCONFIRMED`), a killed-after-deadline
    child (audited, `CHILD_TIMEOUT`), unusable plan evidence
    (`PLAN_UNUSABLE`), and the whole-run ceiling holding during cancellation
    (`PROCESS_DEADLINE` in under 1 s at scale).
- Launcher self-test: 9/9, network none.
- Integration file: offline discovery only skips.

Still to do before any connected proposal: refreeze the shared dependencies,
including other sessions' current bytes such as
`apps/api/src/assistant/general-stock-transfer.ts`. No run is scheduled.

## Runner repairs 2 (review a97e6dde; refrozen, NOT run)

1. **Active whole-run cancellation.**
   - `createRunControl` is shared by the lifecycle and the launcher backstop.
     On cancel it clears every tracked timer, SIGKILLs the child, destroys
     the audit client and ignores late exit listeners. After cancellation no
     plan read, audit or query may start.
   - `orchestrateRun` cancels on its ceiling instead of only abandoning the
     promise.
   - `installBackstop` arms the same cancellation at exactly
     `totalMs = 120 s` from launcher start, with no extra allowance, then
     exits 1. The launcher runs the same cancel before its normal exit.
   - Offline coverage:
     - at scaled 30 ms, PROCESS_DEADLINE with SIGKILL, and a late exit after
       return starts no audit;
     - a connect released after cancel sends no query and destroys the
       client;
     - a cancelled control refuses to start an audit;
     - backstop wiring: a 120 000 ms timer that cancels, kills and exits 1;
     - control timers are cleared and late cleanups run immediately.
2. **Separate cleanup status.** `runAudit` returns the absence verdict
   (counts) and `cleanup` (`closed`, `forced` after a successful destroy, or
   `failed`) separately. A failed cleanup fails the run
   (`AUDIT_CLEANUP_FAILED`) and keeps the evidence. Covered: end() rejecting
   then destroy succeeding (forced), and a hanging end with a throwing
   destroy (failed, run fails).
3. **UNRUN reporting under first failure.** The integration file runs all
   requested sections in ONE sequenced test (`runSectionsInSequence`). The
   first non-completed section stops the run, and every later section is
   reported UNRUN, with no transaction, before the failure is thrown.
   Covered offline: gate refusal, a setup error and a thrown assertion each
   stop at E, with A and C reported UNRUN; all completed returns normally.
4. **Exact plan shapes.** The header must be exactly `{plan, marker}` and each
   record exactly `{planned}` (the planned shape was already exact). Extra
   keys give PLAN_HEADER or PLAN_INVALID, tested.
5. **Budget chapter rewritten** (above).

Offline evidence: tools 27 pass; launcher self-test 9/9; the integration
file only skips offline (3 skips); api tsc has 0 errors in the stock-custody
and general-context files.

## Runner repair 3 (review 655ad2dd; refrozen, NOT run)

The audit's own deadline now invalidates its work, not only the socket.
`runAudit` sets a local `expired` flag in its deadline cancellation and
checks it, along with the shared control, after `connect()`, before every
query and after every query result. A connect or query released after the
audit has returned can therefore never start another query, even if the
client ignores destroy.

The verdict stays timeout (absence unknown, not a pass), and the bounded
cleanup status is kept (`forced` after a successful destroy).

The launcher's audit-client wrapper also refuses to start a connection when
destroy arrived before or during `pg` import or client construction. It
closes and refuses a connection that completes after destroy, and refuses
queries once destroyed.

Offline test (shared control never cancelled, so only the audit's own
deadline acts):
- connect blocked through the deadline: 0 queries at return, still 0 after
  release;
- first query blocked through the deadline: 1 at return, still 1 after
  release;
- both: not a pass, `cleanup: "forced"`.

Tools: 28 pass; launcher self-test 9/9; api tsc has no errors in the
stock-custody files.

## Connected run 1 (root, 13 Oct 2026; reservation 37f31ab9): E refused at gate

- Command: `bun --env-file=/dev/null scripts/qa-assistant-stock-custody.mjs --run
  --sections E --budgets E=100 --environment-root …`.
- Preflight pings: 200, 201, 201, 201, 202 ms (median 201 ms).
- Gate: E=100 × 201 ms = 20,100 ms, over the unchanged 20,000 ms gate.
- Section E: UNRUN at stage `gate`, 0 child section-transaction statements,
  `statementsComplete: false`. No transaction or fixture write began.
- The child exited 1 (the intentional gate refusal, not a custody assertion),
  in 4.5 s. The parent failed.
- Audit: nothing was planned, so its 4 queries were not issued and cleanup
  was `none`. The retained plan file holds exactly the header and no records.
- All frozen hashes were unchanged after the run. The slot was released.

This is NOT rollback proof, idempotency success, a measured statement
count or G04 acceptance. The 201 ms median is current-run evidence only.
The budget is not lowered to 99, the gate is not relaxed and there is no
immediate retry. Any later request needs a fresh rationale and evidence
for its budget and scope.

## Slimmer section E (owner decision 13 Oct 2026; source only, NOT run)

Rationale: section E exercises only the canonical custody command (key
idempotency) and makes no assistant proposals. It nevertheless built the
full assistant context: terms acceptance, Owner membership, session,
`getActiveTenantForUser`, conversation and the rollout override. That is
setup E never uses.

Change:
- `balanceFixture` (synthetic Product through
  `createSimpleCatalogItemInTransaction` directly, which also avoids that
  helper's own savepoint, plus the on-hand 10 / reserved 2 Store balance) is
  split out.
- `sectionIdempotency` takes `CustodyBalanceEnv {db, tenantId, storeId,
  userId}` and is exported in `custodyBalanceSections`.
- For such sections the integration file creates only a synthetic user, QA
  Tenant and Store, then runs the section. There is no session, terms,
  context, conversation or rollout override.
- The context sections A–D and F–H use the same balance fixture (so one
  fewer savepoint each) and are otherwise unchanged.
- The assertions of E are unchanged.

Fresh statement estimate (static count from source, unmeasured):

| Part | Statements |
|---|---|
| SET LOCAL | 2 |
| Minimal user/Tenant/Store | 3 |
| Product creation | ~30 |
| Offering read plus balance create | 2 |
| Revision read | 1 |
| First custody call (Store lock, idempotency read, balances, upsert, relocation lock, movement, valuation, savepoint pair) | ~30 |
| Idempotent replay | ~8 |
| Mismatched-input refusal (including savepoint rollback) | ~10 |
| Final read | 1 |
| **Total** | **~87** |

Product creation is counted conservatively: the simple product path runs
about 20–28 creates, reads and helper locks, and Prisma nested writes can
add statements. The total excludes driver-level BEGIN/ROLLBACK.

Proposed budget: `E=90` (estimate plus a small statement margin). At the
last measured 201 ms median it projects 18.1 s, inside the unchanged 20 s
gate, with about 12 s of the 30 s transaction left. The gate is not relaxed.
A fresh median above 222 ms would still refuse it UNRUN. The count remains
an unmeasured estimate, not a bound.

## Connected run 2 (root, 13 Oct 2026; reservation c13dbecc): slim E PASSED

- Command: `--run --sections E --budgets E=90`.
- Preflight pings: 200, 200, 201, 202, 203 ms (median 201). Gate: 90 × 201 =
  18,090 ms, below the unchanged 20,000 ms.
- E completed: stage `rollback`, 71 statements (child section-transaction
  query events), `statementsComplete: true`.
- Canonical assertions passed:
  - same key and input → same operation;
  - changed quantity → "already used with different input";
  - on hand 10 → 9.
- Timing: section 15.0 s; Bun 19.0 s. The child exited 0. Parent PASSED.
- Read-only absence audit: 4 statements, planned fixture rows absent, cleanup
  closed. Plan evidence was removed after the pass.
- Frozen hashes matched before and after. The slot was released.

Scope: this is bounded evidence of canonical custody idempotency and of
forced rollback with fixture absence. It is not evidence for signed
assistant proposals, UI/native, authorization, target-only drift,
cross-connection concurrency, finance valuation with a Book or unrelated
rows, and it is not G04 acceptance. Sections A–D and F–H stay UNRUN.

71 is an observation for this exact slim fixture (the static estimate was
~87), not a future bound. Any later budget keeps an explicit margin. There
is no automatic retry or next section.

## Section A assertion repair (review 0a189369; refrozen, NOT run)

Section A now requires the custody adapter's own refusal: the draft must
reject with TRPC code `CONFLICT` and the message "Only 8 Piece can move: on
hand 10, reserved 2."

- The fixture unit is the catalog's canonical unit "Piece", factor 1.
- `inFreshGeneralTransaction` rethrows everything except P2034 retries.
- Any other rejection (authority, missing conversation, other validation)
  or an unexpected success fails the case.
- The unchanged proposal-count and on-hand (10) assertions are kept.

Offline: integration discovery has 3 skips, and api tsc has no errors in
the stock-custody files. A=80 remains a static proposal, not a measurement.

## Connected run 3 (root, 13 Oct 2026; reservation ac914e0e): A PASSED

- Preflight median 200 ms (pings 200, 200, 200, 226, 235). Gate: 80 × 200 =
  16.0 s, which fits.
- A completed at stage `rollback`: 51 child section-transaction statements,
  `statementsComplete: true`.
- The exact CONFLICT "Only 8 Piece can move: on hand 10, reserved 2."
  matched. The proposal count was unchanged and on hand stayed 10.
- The child exited 0. Parent PASSED. The read-only absence audit (4
  statements) passed and cleanup was closed.

This is bounded evidence of the draft-side over-movable refusal through
fresh authority, plus forced rollback and fixture absence. It does not show
signed confirmation, the full authority matrix, UI/native or G04
acceptance, and 51 is not a future bound. B–D and F–H stay deferred and
UNRUN.
