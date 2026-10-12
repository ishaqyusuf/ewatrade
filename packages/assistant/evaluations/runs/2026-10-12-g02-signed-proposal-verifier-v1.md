# G02 signed proposal verifier preparation v1 — 12 October 2026

**Prepared, locally checked, not connected-run evidence.** G02 remains
partial/planned/unaccepted. Accepted roadmap is still 13/45 (28.9%).

Historical preparation state. The subsequent scheduled attempt failed the saved
AssistantBudget fingerprint gate; see [attempt and continuation](2026-10-12-g02-signed-rollback-attempt-v1.md).

The coordinator's original G02 delivery commit is `e74ee141`. This addition changes
only ticket-owned verification source, one new dedicated Brain plan, this evaluation,
and ignored local runner/evidence files. No common registry/catalog or production
implementation change is included.

## Verifier behavior

- Uses real `decideGeneralProposal` fresh-auth transaction callback and registered
  `cashCountRecord` adapter, canonical count command, canonical original-count read,
  and original assistant receipt persistence. No simulated domain command/provider.
- Exact QA database/Tenant/ACTIVE Store/ACTIVE Owner/email/saved GENERAL chat guards.
  Existing Book/CASH asset account/open posting interval required; no setup fixture.
- Explicit scheduling flag, root local profile/production identity guards, random
  process-only approval key and temporary process-only capability visibility.
- One caller-owned Serializable transaction per case, maxWait 10000/timeout 30000;
  no nested transaction or root command inside it. Unique forced-rollback sentinel.
- Completion/zero original receipt/completed replay; changed-token CONFLICT; stale
  posted basis after canonical rollback-only one-minor-unit owner contribution.
- Full-row fingerprints/counts for 39 Finance tables across all Tenant Books, saved
  authority/auth and assistant graph/proposals/setup drafts, plus all budget rows.
  Source and runtime Finance inventory checks refuse drift. No raw content, session
  credentials, signing token, or key is saved in evidence.
- Every successful case compares full saved state before/after rollback and requires
  no retained proposal. Refusal and completed replay also compare transaction-local
  full fingerprints. Confirmation permits only one new count/command and completion
  of its seeded proposal; journals/date locks/close facts stay unchanged.

## Local checks

Five provider-free safety tests / 26 assertions pass: environment/signing material,
exact scope substitutions, bounded Serializable options, complete Prisma Finance
inventory/drift, and mutation detection despite unchanged row totals.

The launcher was invoked **without** its scheduling flag. It exited 1 with the
expected scheduling guard before environment loading or child creation. This is a
guard check only; no database query or connected suite was started.

Scoped four-file Biome and focused nonincremental TypeScript pass. TypeScript output is recorded
in `artifacts/assistant-operations-parallel/G02/types-signed-proposal-v1.txt`.
Provider-free logs are `tests-signed-proposal-v1.txt` and
`lint-signed-proposal-v1.txt`. No new browser or mobile testing was needed for this
verification-only addition; original delivery screenshots remain source previews.
The new launcher also passes `node --check`; source whitespace checks pass.

## Coordinator handoff and limits

New launcher: `artifacts/assistant-operations-parallel/G02/signed-proposal-rollback.mjs`.
Explicit scheduling input: `RUN_G02_SIGNED_PROPOSAL_ROLLBACK=1`.
On a future successful connected run, the runner writes
`signed-proposal-rollback-result-v1.json`, including per-case full before/after
count/fingerprint evidence and sanitized checks. **That result does not yet exist.**
D04 held the exclusive QA slot during preparation; no independent run was started.

This is dispatcher source composition, not HTTP transport or saved browser proof.
Replaying its captured fresh-auth callback inside the same transaction is explicit;
it does not prove independent concurrent/HTTP retries. Receipt failure recovery,
revocation/cross-scope, native history/open-close navigation in the saved web runtime,
and true financial close remain open. A future pass must retain `acceptance:false`.

No actual provider/model/mail, persistent signing key/visibility, ACTIVE grant,
saved fixture deletion, API restart, deployment, schema/migration, mobile change,
stage/commit/push/reset/stash, or common catalog update occurred. E05 activation/API
restart approval is unchanged. Brain documentation impact is recorded in
`.brain/plans/2026-10-12-g02-signed-proposal-acceptance.md`.
