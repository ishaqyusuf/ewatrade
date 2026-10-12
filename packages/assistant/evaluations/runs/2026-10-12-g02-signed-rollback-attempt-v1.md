# G02 signed rollback attempt and recovery preparation v1 — 12 October 2026

**Failed connected attempt; G02 partial/planned/unaccepted.** Accepted remains
13/45 (28.9%). This is distinct from the original passed canonical source rollback.

## Actual scheduled run

After G01 disconnected and released its slot, the coordinator assigned G02 one
exclusive three-case signed suite. The normal-network run used the root local
profile/production guards and exact existing QA scope, random process-only approval
key and process-only capability visibility. Session 95921 reached terminal exit 1.
The client disconnected in runner `finally`, child exited, and slot was released.

Failure: `Saved AssistantBudget facts changed`, at the post-root saved-state
comparison after a forced rollback. No timeout occurred. No successful result JSON
was saved. The comparator threw at its first mismatch, so no passed case, per-table
equality of remaining graphs, or complete acceptance is claimed. No raw content or
signing material was printed. A Pg parallel-query deprecation warning also appeared.

Evidence: `artifacts/assistant-operations-parallel/G02/signed-proposal-terminal-v1.txt`
and sanitized `signed-proposal-attempt-v1.json`.

## Diagnosis and source additions

No connected query/probe/rerun followed release. Source inspection found no current
`limitGeneralAppRequest` symbol and no budget write/reservation on the dispatcher
path. The allowance helper is read-only, and the client has one primary Pg adapter.
The cause remains unknown. Parent reports no other connected suite overlap and
only an unauthenticated dashboard redirect; concurrency is not inferred.

The signed verifier now saves full all-table comparison evidence and changed-table
names before throwing, including unexpected transaction failures. Opaque per-budget
key/row fingerprints locate changes without keys/content, alongside the unchanged
mandatory aggregate all-budget assertion. A source observer records budget delegate
method and root/transaction boundary, preserving original arguments, receiver,
policy effects, return values and rejection identity. No quota bypass or scope
narrowing. The original three cases and every original assertion remain.

Eight provider-free safety tests/38 assertions pass. Focused signed nonincremental
TypeScript passes; scoped Biome passes. Updated logs use `*-signed-proposal-v2.txt`.
The original preparation report remains historical; it is not signed success proof.

## Additional disconnected verifier

New `general-cash-count-receipt-fault.ts` injects a failure only for this exact
proposal's COMPLETED receipt write after native count execution.
`general-cash-count-recovery-rollback.integration-check.ts` retains one real bounded
Serializable root transaction per case and full all-graph rollback checks:

- Actual injected receipt failure escapes the owning transaction after native count;
  no retained proposal/count/command is allowed.
- Recreates the same reviewed proposal, payload, approval and command key in the
  rollback-only PENDING baseline, confirms one original count/receipt and completed
  replay, and refuses an original read under a wrong Book.
- Expired saved session returns UNAUTHORIZED; suspended saved membership returns
  FORBIDDEN; proposal outside the current Store returns NOT_FOUND. Seeded native
  facts and pending proposal must be unchanged after each refusal.

This retry fixture does not prove a persisted pending draft or independent/concurrent
HTTP retries. Its separately guarded launcher is
`artifacts/assistant-operations-parallel/G02/recovery-rollback.mjs`, requiring
`RUN_G02_RECOVERY_ROLLBACK=1` and a new exclusive coordinator schedule. It has not
connected or produced success evidence. HTTP/saved-web acceptance, native history,
day-summary/checklist and financial-close limitations remain open.

No actual provider/model/mail, persistent key/visibility, new ACTIVE grant, saved
fixture deletion, API restart, schema/migration, mobile, stage/commit/push/reset/stash
or deployment occurred. No original delivery/registry/catalog change. E05 approval
is unchanged. Brain impact: dedicated acceptance plan updated for this failure,
diagnostic source and unscheduled recovery suite.
