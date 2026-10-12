# S02 invitation privacy inventory — 12 October 2026

S02partial/planned/unbookmarked.13/45accepted28.9%,32awaiting71.1%. No model run.

## Gap and implementation

The durable StaffInvitationCommand/Notification/Attempt records added by S02 were
absent from the additional-personal-data inventory. A prior membership access outcome
could not dispose of the original grant/contact/actor receipt, encrypted acceptance link
or provider/attempt history, but profile processing and completion had no contradiction
check for these new families.

A single parameterized SQL snapshot now counts commands, notifications, attempts,
encrypted payloads, queued notifications, uncertain sends and notifications containing
provider identifiers. It scopes original actorUserId, recipient Membership.userId or
invitation.invitedUserId; includes removed memberships and every lifecycle status.
OR scope counts each command once. Optional verified contact also detects unlinked legacy
invites and original result.details.recipient.email, case-insensitively, independently
of changed live contact. An email match is a review candidate, never proof of ownership
or deletion authority. Matching JSON snapshots is a scan; no new index/DDL is introduced.
Seven typed nonnegative safe-integer counts only; missing/corrupt inventory fails closed.
No address, token, content, original grants, ciphertext or provider ID values returned.

Existing additional inventory incorporates these counts. Profile processing refuses
NOT_READY/CLAIM_CONFLICT before writes; deletion completion adds existing
ADDITIONAL_PERSONAL_DATA_REVIEW_REQUIRED even with a prior complete ledger. Existing
platform-admin reviewDetail adds nullable staffInvitationReviewInventory. Immutable
verified subject survives User removal; unverified/mismatched requests yield no
subject inventory. Contact candidates use the existing verified-email boundary; no
new caller-supplied account scope or permission. The source read does not process or
erase rows and does not approve a retention period or exemption.

## Verification

- 144 focused tests363assertions across new inventory, touched profile and completion;
  additional two targeted operator-review regressions45assertions. Total146 unique
  tests408assertions. No broad account-privacy, repository or mobile suite run.
- Seven new positive-family profile and completion refusal cases despite earlier
  approved outcomes. Count projection/verified contact/missing-corrupt results,
  mismatched and removed principal operator-review checks pass.
- Scoped changed query/verifier/tests TypeScript and11-file Biome pass.
- Exact owned ewatrade_qa_v1/Tenant/Owner/Store guard, root profile and Production
  identity separation. Real parameterized aggregate reads inside one bounded
 10s/30s forced rollback transaction, synthetic INVITED fixtures only.
- Process89328 exit0,15.619s: exact creator increment and recipient queued/custody counts;
  foreign/unverified contact zero; historical original snapshot contact candidate;
  canonical claim/start/unknown→simulated known receipt, attempt/provider counts;
  removed membership/revoked invitation still retains attributable history.
  Inventory reads preserve transaction facts and full saved staff/auth/chat/budget
  snapshot after rollback. ProviderCalls0,privacyCommands0; no saved deletion or fixture.
- Known pg parallel-query warning remains; no timeout/nested transaction/root call inside tx.
- Desktop guarded QA source renders actual returned count objects for queued/unknown/
  retained history with explicit rollback/no-erasure label; zero captured warnings/errors.
  Navigation timeout was rechecked on the same existing tab64, which had loaded normally;
  no new tab/runtime restart. Owned tab/temp route removed. This preview is not an
  authenticated platform-admin saved HTTP/browser acceptance or a production UI change.

Screenshots: artifacts/assistant-operations-web/s02-privacy-queued-web.jpg,
s02-privacy-unknown-web.jpg,s02-privacy-history-web.jpg.
Result: artifacts/assistant-operations-web/s02-privacy-inventory-rollback.json.
Guarded runner: node artifacts/assistant-operations-web/staff-invitation-privacy-rollback.mjs
(ephemeral custody key; exact database; forced rollback; no credentials output).
Versioned verifier: apps/api/src/staff/invitation-privacy.integration-check.ts.

## Remaining

Approved disposition/retention/expiry handling of original commands, revoked/expired
ciphertext, unknown sends and provider copies is still required. This inventory makes
unhandled data visible and prevents false completion; it does not implement positive-
data disposal or certify erasure. S02 controlled email/queue, concurrency, saved GENERAL
confirmation/recovery and full web acceptance remain open. No flags/keys/admin grant,
provider/email/model/task/queue, actual privacy command/deletion, schema/migration,
mobile, API restart, push or deployment. E05 activation/restart approval untouched.
