# G02 native read verifier preparation — 12 October 2026

Source prepared after coordinator lifted the ticket-owned freeze; **not executed**.
No connected slot has yet been assigned. Signed 3-case and recovery 5-case source
passes remain separate; initial unknown AssistantBudget failure is retained.

`general-day-close-read-rollback.integration-check.ts` calls the actual source
`readGeneralCashCountHistory` and `readGeneralDayClose` wrappers using the existing
QA Owner, active Tenant/Store, live saved session, saved GENERAL chat and Finance
Book. The process-only random approval key supports `requireGeneralScope`; no
manifest visibility change or persistent key is needed. Local environment, explicit
separate scheduling flag, exact QA database/identities and Finance inventory guards
fail closed before reads. No financial/proposal/auth fixture is created, even locally.

Four proposed cases:

- Native history with assistant limit 10, currency, descending asOf/id order,
  distinct IDs and valid native next cursor. If an actual saved row exists, read
  its native original detail in the same transaction and compare original basis.
  Record empty history and unavailable positive pagination explicitly.
- Unknown history cursor must yield canonical CONFLICT.
- A generated missing/nonowning Book must yield canonical NOT_FOUND. This is not
  proof using an actual other-Tenant Book or another account's existing cursor.
- Actual completed UTC day checklist and posted summary share Book/currency,
  native current watermark, cutoff, bounded day start and unresolved source gaps.
  Posted facts cannot certify operational closing; no fiscal/date-lock write.

Each wrapper retains one real root RepeatableRead transaction with maxWait 10s,
timeout 30s. The runner intercepts its callback only to observe results, compare
all table/all budget fingerprints inside the transaction and force rollback.
No nested/root native calls occur inside that transaction. After every outcome,
including an unexpected error, save full root before/after fingerprints before
comparing/rethrowing. Fresh saved-session expiry is checked inside each transaction;
native finance membership authority remains native. Source composition is not
registered HTTP middleware/session authentication evidence.

Ignored `native-read-rollback.mjs` / `.ts` load the existing named QA profile, use
one child process and disconnect in finally. No automatic retries, provider,
persistent fixtures, rollout change or API restart. Focused source/runner TypeScript
passed (exit 0); source Biome passed. Coordinator review and explicit slot required
before execution. No result JSON or pass is asserted.

Saved-session read-only HTTP and real saved-browser global sheet/chat-draft checks
remain next gates. Rolled-back count IDs cannot serve as saved positive fixtures.
G02 remains partial/planned/unaccepted; accepted 13/45.

Saved HTTP preparation also type checked (exit 0): ignored
`saved-http-read.mjs` / `.ts` require their own explicit scheduled flag and exact
QA context. Existing registered API at localhost:3095, bounded 30s per request:
finance history, optional actual original detail, checklist, same-watermark reports,
then the actual saved GENERAL conversation. Bearer token stays in process memory;
no token, raw conversation or financial payload is printed or saved. Result retains
only target IDs, status/check summaries and opaque full fingerprints. Failed or
stale API behavior is recorded before throwing; no restart or key/rollout mutation.
No HTTP request executed. Browser work requires its own assigned scope and the
existing authenticated dashboard runtime, preserving chat and an unsent draft.
A missing actual original count remains a positive receipt gate, even if an invalid
object link or day-close overlay can be exercised. No synthetic saved receipt.

Execution checkpoint: coordinator subsequently reviewed/assigned one attempt.
Actual four-case pass and missing saved original/pagination coverage are recorded
separately in `2026-10-12-g02-native-read-rollback-v1.md`; preparation above remains
historical. Saved HTTP/browser work still has no assigned slot or execution.
