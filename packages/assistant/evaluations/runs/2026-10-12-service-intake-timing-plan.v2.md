# D04 transaction timing proposal v2

Historical proposal: the four-case split was subsequently implemented; see
`2026-10-12-service-intake-four-case-source.v3.md`. No v2 connected run occurred.

12 October 2026. Source review only; no connected rerun and no QA slot held.
D04 remains partial/unaccepted, accepted roadmap 13/45. The v1 attempt failed at
native serviceIntake.update after32262ms against the unchanged 30s limit. Saved
graph comparison passed; this is failure evidence, not canonical acceptance.

## Ranked hypotheses and source evidence

1. Fixture setup consumes command budget. Canonical catalog create executes
   publication/access checks, replay reads, financial and advisory locks, Store
   reads, slug selection, and individual item/service/variant/offering/policy/
   availability/receipt writes before D04 starts review. Relevant source:
   catalog.ts:763-1308. The fixture command is scaffolding, not the intake under
   evaluation. Prediction: reducing setup to one guarded statement reduces the
   fixture phase while leaving native execution/replay timings comparable.
2. Repeated preparation consumes round trips. The verifier calls review; its
   execute closure reviews again; createServiceIntakeDraftInTransaction performs
   canonical preparation again. Each reads Store, Offerings with their related
   graphs/settings/assignee; assistant reviews also load authority and Customer.
   Prediction: the trace contains repeated delegate reads under canonical-review
   and canonical-execution before any intake is inserted.
3. Graph hydration consumes command and replay time. confirmServiceIntake loads
   full jobGraph after event/assignment/due writes, before marking Intake
   confirmed. Replay loads that graph again. replaceDueReminder cancels old
   intents and reads settings/timezone even when no customer phone exists.
   Prediction: late execution/replay delegate durations dominate after fixture
   reduction. Relevant source: service-work.ts:338-408, 789-1000.

These are hypotheses, not measured causes. No native freshness read, authorization,
lock, preparation or result graph has been skipped or cached in this proposal.

## Proposed changes prepared for review

- service-intake-rollback-fixture.ts follows the existing staff invitation fixture
  pattern. One parameterized CTE creates only transaction-local catalog/service,
  two active variants with one fixed Offering each, service policies/current Store
  availability, and a synthetic customer without a phone. It rechecks the exact
  database/QA Tenant/active Store/active Owner/email and locks their records. JS
  guards exact IDs, local/development/explicit-run flags and UUID nonce. Returned
  identities and all insertion cardinalities are checked. No ACTIVE staff grant,
  command receipt fabrication, provider or root/nested transaction call.
- Native preparation then validates the inserted choices. Both tracked payment-
  gated and charge-only lines remain. Assignee, promised timestamp and saved
  customer identity remain. No existing saved Offering is mutated by the test.
- service-intake-rollback-timing.ts proxies the actual caller-owned transaction.
  It preserves arguments/results/errors and records only operation names,
  per-phase start/duration/outcome, and transaction body start. Delegate calls can
  issue several SQL requests: these counts are not SQL query counts. No SQL,
  parameters, contacts, credentials, provider payloads or keys are recorded.
- Verifier phases include fixture, canonical review, execution, replay, original
  Order/no-notification checks, original receipt, later Customer/Offering edits,
  unchanged owning receipt, stale rejection, temporary revocation, revoked
  rejection and post-rollback saved-state comparison. Every existing assertion
  remains. Stale must reject REVISION_CONFLICT and revoked must reject FORBIDDEN;
  generic failures/timeouts no longer pass those checks.
- run-rollback.ts writes rollback.v2.json on full success or
  rollback-failure.v2.json on a transaction failure, including timings and matched
  saved-state hashes. Exit remains nonzero for failure. No v2 connected evidence
  exists yet. Limits remain maxWait10000/timeout30000, Serializable, forced rollback.
- Canonical and signed before/after statements now include all Tenant customer
  ledger accounts/entries/commands/receipts/allocations/releases and every Tenant
  Finance Book/account/command/journal/journal line/period, including account and
  Book sequence fields. Zero initial payment does not imply zero receivable effect.
  Only hashes leave these reads. Financial mismatch is a failed verifier even if
  the original transaction also failed; no rows are allowed to differ. The v1
  timeout's old hash did not include these financial graphs, so it is not empirical
  proof of unchanged Finance/customer-ledger state. No new measurement is claimed.

## Next scheduled measurement

Parent permits splitting independent probes while preserving the full suite.
Proposed case boundaries for review before the next full-suite attempt:

| Case | Required assertions within one fresh rollback transaction |
| --- | --- |
| Creation/replay/owning receipt | Exact2500 total, tracked-only graph, PENDING_PAYMENT, selected Customer linked to Order, no notification intent, original Intake/Order/Job IDs on replay, owning receipt |
| Immutable snapshot | Fresh canonical creation plus owning receipt, then Customer/Offering edits and second receipt; original facts remain identical |
| Stale target | Fresh fixture and canonical preparation, later Customer/Offering mutation, typed REVISION_CONFLICT and no Intake from the refused identity |
| Revoked authority | Fresh fixture and preparation, temporary Owner suspension, typed FORBIDDEN and no command graph from refusal |

Each case must force rollback and independently compare the complete saved-state
fingerprint, including CustomerLedger/Finance, after success or failure. Every
command and its owning receipt remain inside that case's single transaction;
never move receipt persistence outside execution. Report success only when all
four cases pass, and never count one case as full ticket acceptance. Keep
maxWait10000/timeout30000 on every transaction. Timing labels must identify case
as well as phase. The current instrumented v2 runner still contains the complete
single-transaction baseline; this case split is a reviewed source plan, not an
already implemented or measured multi-transaction runner. Parent can request its
implementation before scheduling if that is the chosen next measurement.

Coordinator reviews the fixture SQL and timing proxy before granting one canonical
QA slot. Run the unchanged guarded run-rollback.mjs command once. Inspect fixture
duration, execution start relative to transaction body, repeated preparation call
durations, native execution, replay and post-command assertion phases. All checks
must complete under the same 30s limit and saved-state hash must match. An expired
transaction remains a failed run even if state is preserved.

If fixture reduction is insufficient, use the captured phases to review a native
optimization separately. Do not remove fresh execution authority/revision checks,
introduce persistent fixture reuse or widen timeout. Signed runner is still
unscheduled; no source activation/restart/provider/DB write occurred this turn.

## Additional bounded-read correction

general-service-intake-options.ts uses protected catalog.listItemsPage, kind
service/status active/query/cursor/limit20. It returns at most100 Offerings and an
Offering continuation within crowded pages before advancing the Catalog cursor.
No same-name merge or page-as-complete claim: exhaustive=false, coverage is one
bounded page. Canonical search currently caps ranked candidates at300, so even
exhausted search continuation is not proof of every business Offering. The model
must narrow ambiguity. Existing catalog.listItems is no longer called by this tool.

Assignee display retains protected services.assignees authorization and intersects
it with canonical listServiceAssignees({tenantId,storeId}), sharing the exact
Store eligibility predicate with Intake confirmation. Owner/Admin/legacy staff
remain eligible; scoped staff require an active assignment at the current Store.
The common scoped Manager create policy remains closed. Procedure inventory stays
catalog.listItemsPage, services.getSettings, services.assignees.
Reads use a createTRPCRouter namespace wrapper so scoped policy middleware sees
those full canonical paths rather than standalone listItemsPage/getSettings names.

The dashboard editor's existing loader still uses catalog.listItems and business
assignees; its fresh confirmation guard refuses invalid selections. That loader
requires separate bounded UI option work before full D04 acceptance. This model
tool correction alone does not establish complete editor/runtime coverage.

## Focused source evidence

Existing provider-free suite:13 tests/59 assertions passed. Additional tools suite:
4 tests/19 assertions passed (exact fixture scope refusal before statement, proxy
argument forwarding/error propagation/no-secret evidence, crowded-page continuation
without skipping/merging, missing continuation rejection). Biome passes on changed
owned files. Final scoped TypeScript check against actual shared registration,
including the helper tests and namespace caller, passed with zero diagnostics.

Parent has applied central registration; historical integration.patch and overlay
must not be reapplied. No shared registry change or git mutation from this turn.
