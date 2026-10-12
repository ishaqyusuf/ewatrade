# Saved conversation and signed service intake checkpoint

Web/dashboard only. Accepted tickets remain 13/45 (28.9%); these results do not
accept G02 or D04.

## G02: corrected saved conversation read

One registered `assistant.conversation` GET returned HTTP 200 and matched saved
GENERAL conversation `cmv4i45w70000eb9kl7jkfa3e` in the exact owned QA scope.
The verifier uses the actual router DTO; it no longer checks a nonexistent
`purpose` response field. All 72 covered before/after state fingerprints matched.
Terminal 27884 exited 0 and disconnected. No Finance GETs were repeated; the
three earlier passing Finance reads are reused. No provider calls or writes.

Evidence: ignored `artifacts/assistant-operations-parallel/G02/`
`saved-http-conversation-only-result-v1.json` and terminal-v1 file. The original
failed all-scope attempt remains preserved. Empty original cash-count data still
does not prove positive receipts or pagination. Actual dashboard continuity is
separately scheduled.

## D04: signed service intake attempt

Five reviewed verifier paths committed to main as `2ec07d31`. Existing eight
new tests/63 assertions, source compilation and formatting results were reused.
One full 13-case run was scheduled with an explicitly pinned existing QA session,
process-only signing/visibility and unchanged 10s/30s transaction limits.

`edit-confirm` passed, including original native Intake/Order/Job receipt and
full saved-state preservation (24,000ms). `completion-replay` reached genuine
original receipt, atomic completion, and fresh-authority replay assertions; its
identity forced rollback succeeded. Its subsequent saved-state comparison failed
(19,820ms): only `D04:QaClientAuthorization` changed, with 64 rows before and after
and differing full-row aggregate hashes. The other 11 cases were not reached.

Terminal 2295 exited 1; process visibility was restored and the database client
was disconnected. No retry or canonical suite was run. The failure remains
unresolved: aggregate evidence cannot identify the row, field, writer or cause.
The normal QA validation source updates `lastValidatedAt`, but this is only a
possible explanation and does not establish attribution. No assertion or covered
table was excluded to obtain a pass.

Evidence: ignored D04 `signed-rollback-failure.v2.json`,
`signed-rollback-terminal.v2.log` and pre-run feature configuration. No provider,
HTTP/browser call, persistent fixture, new session/grant, schema generation or
API restart was performed by this verifier.

## S03: pending signed execution

Four-case real signed dispatcher verifier committed as `5b1b90f7`: suspension/
completed replay, cancellation/replay, changed token and stale revision. Scoped
source compilation and formatting passed. Execution is not yet assigned/proven;
INVITED fixtures never receive ACTIVE membership. Accepted reactivation and
persisted/concurrent recovery remain separate requirements.
