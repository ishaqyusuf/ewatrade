# D04 four-case rollback source v3 — 12 October 2026

Outcome at source handoff: split implemented and verified offline. Connected QA was unscheduled;
G02 owned the exclusive slot. The subsequently scheduled canonical attempt failed;
see `2026-10-12-service-intake-four-case-attempt.v3.md`. D04 remains partial/planned/unaccepted and the
accepted roadmap remains13/45 (28.9%). No performance improvement is measured.

## Implemented case boundaries and preserved assertions

| Case | Assertions retained from the original suite |
| --- | --- |
| creation-replay-receipt | Canonical total2500 and trackedLineCount1; identical Intake/Order/first Job IDs on replay; exactly one tracked Job with one line (charge-only creates none); PENDING_PAYMENT; selected saved Customer linked to the owning Order; zero notification intents; original owning receipt read |
| immutable-snapshot | Fresh canonical creation and original owning receipt; Customer name edit and tracked Offering name/price edit; second owning receipt is JSON-identical to original facts |
| stale-review | Fresh canonical preparation; Customer and Offering edits; new command identity refuses with CatalogError REVISION_CONFLICT, with every unexpected error rethrown |
| revoked-authority | Fresh canonical preparation; temporary Owner membership suspension; canonical review refuses with ServiceIntakeReviewError FORBIDDEN, with every unexpected error rethrown |

The exact total/work-policy assertion runs for every case. Both refusal cases
add before/after Tenant Intake and Order counts, proving no graph creation.
Each case has a distinct nonce and guarded transaction-only fixture. No old
Customer, Catalog or Commercial Order is needed for fixture prerequisites.
Only the existing exact QA Tenant, Store and Owner are required and revalidated.

Each case executes sequentially in one root Serializable transaction with
maxWait10000 and timeout30000. Native execution/replay/owning receipt stay inside
the same transaction in creation/replay, and creation/owning receipts/source edits
stay inside the same transaction in the immutable-snapshot case. No root domain
command or nested transaction is introduced. Native command preparation, fresh
authority/revision checks, locks and result hydration remain unchanged.

An identity-based private error marker forces rollback after a case completes.
Each case captures its full Tenant/domain/CustomerLedger/Finance hash outside the
transaction before and after, including after errors. Missing state, mismatched
state, failed post-read, unexpected errors and timeouts fail the suite. A failed
case retains its own timings/hashes plus completed-case evidence, then stops.
Success requires all four complete, deliberately rolled-back, unchanged cases.
No partial case constitutes D04 acceptance. Timings retain case/phase/delegate
labels without SQL/arguments/contact/credential data.

## Runner and reviewable files

- apps/api/src/assistant/general-service-intake-rollback.integration-check.ts
- apps/api/src/assistant/service-intake-rollback-cases.ts
- apps/api/src/assistant/service-intake-rollback-cases.test.ts
- artifacts/assistant-operations-parallel/D04/run-rollback.ts (ignored child runner)

The scheduled entry point stays
RUN_D04_QA_ROLLBACK=1 node artifacts/assistant-operations-parallel/D04/run-rollback.mjs.
The root profile and exact QA/production-separation guards are unchanged.
The child writes rollback.v3.json on all-four success or rollback-failure.v3.json
on a case failure. At source handoff no version3 result artifact existed. The later scheduled
attempt wrote rollback-failure.v3.json; no success artifact exists.
The signed runner remains separately unscheduled and unchanged by this split.

## Offline validation

25 provider-free tests /102 assertions pass across the focused rollback-case,
fixture/timing/options, canonical review and assistant contract tests. Eight new
orchestration tests verify four distinct sequential bounded transactions, state
checks per case, original timeout cause/code and completed-case evidence, matching
message impostor rejection, fourth-case failure, missing rollback boundary,
state mismatch, missing baseline and failed post-rollback read.

Biome passes the three changed API source/test files. Actual scoped TypeScript
includes the current shared integration, new orchestrator/test and TS child runner;
no virtual registration overlay is used. Final scoped TypeScript exits0 with
zero diagnostics (`bunx --no-install tsc -p /private/tmp/d04-tsconfig.json --noEmit`).
UI testing is not applicable: this change only restructures the backend QA verifier.
No connected DB call, provider/model, API restart, fixture persistence, activation,
schema migration, git stage/commit/push or shared registry edit occurred.

## Brain impact

Updated ticket-specific feature, source plan and composition ADR with the new
case boundaries, preserved bounds/assertions, offline status and QA scheduling
gate. Common Brain/API/contracts/permissions/tasks are coordinator-owned and
unchanged; product behavior and database schema are unchanged by this verifier.
Historical timing-plan.v2 has a superseding-evaluation notice; historical timeout
evidence remains unchanged. The v1 saved-state hash omitted CustomerLedger/Finance
and therefore still does not establish complete financial-state proof.
