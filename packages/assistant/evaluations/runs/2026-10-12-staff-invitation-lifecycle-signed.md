# S02 signed resend/revoke and completed replay — 12 October 2026

S02 partial/planned/unbookmarked. Roadmap13/45 accepted28.9%,32awaiting71.1%
(13partial,18pending,1deferredA04). Web/dashboard only; full objective active.

## Actual signed database checks

Guarded root local profile and production-identity refusal; exact ewatrade_qa_v1,
classified QA Tenant cmuzedcda000hbw9kd6e50z8u, Owner/user and active Store/saved
GENERAL conversation verified. No API process or persistent visibility changes.
Only staff.invitation.manage is source-visible inside the isolated test process,
restored in finally; ephemeral signing/custody keys are never persisted/printed.

A parameterized single-statement CTE seeds pending CASHIER/INVITED membership,
profile, original Store assignment, pending link and encrypted legacy outbox. SQL
itself checks exact current database, Tenant/Store/Owner identities, classification
and current authority before any insert. This is a transaction-local fixture,
not native invite acceptance. It creates no credentials or ACTIVE membership.

Each real current native lifecycle review supplies the stored target/hash. Server
HMAC approval and proposal are seeded in the same intercepted transaction; real
`decideGeneralProposal`, fresh session/workspace/age/privacy/legal/authority and
canonical lifecycle adapter run to COMPLETED. Same transaction callback is invoked
again for the actual completed signed replay path with fresh checks. No root query,
root/nested transaction, altered timeout or mock mutation inside the transaction.
Existing Serializable maxWait10s/timeout30s preserved. After proof/native reads,
forced rollback removes all seed/execution facts; no fixture deletion command.

Authoritative terminal50880 exits0, result verified true:

| Case | Elapsed |
|---|---|
| Resend completion + signed completed replay |20.831s|
| Resend changed token refusal |6.055s|
| Resend changed access revision refusal |8.524s|
| Resend already accepted link refusal |8.450s|
| Revoke completion + signed completed replay |19.139s|
| Revoke changed token refusal |6.182s|
| Revoke changed access revision refusal |8.427s|
| Revoke already accepted link refusal |8.415s|

Original grants/default Store/access revision/catalog/INVITED status unchanged.
Original link revoked, pending work CANCELLED/ciphertext erased/zero attempts;
resend creates distinct ACTIVE pending link and PENDING encrypted notification,
zero provider acceptance/delivery/attempts. Revoke creates no outbox, exactly one
INVITE_REVOKED event, member still invited and seat-counted. Original receipt
retains reviewed reason/recipient/Store/hash. Exact command/member discovery
returns2resend/1revoke invitations without secrets. New user has zero Account
credentials/Session records. Completed replay returns identical app receipt and
full transactional snapshot unchanged. Six refusal cases compare complete stage
snapshots after the deliberate test-only change and before/after decision; no
command/proposal/staff/auth/outbox side effect. Accepted-link fixtures change only
invitation status/time inside rollback, not actual onboarding or membership activation.

Every case compares full saved Tenant/staff profiles/assignments/invitations/
lifecycle/access/commands/outbox/attempts/Tenant staff users/sessions/accounts/
conversations/messages/proposals/runs/budget hashes, all unchanged after rollback.
Shared snapshot helper is mechanically extracted from the prior INVITE verifier;
query remains identical, missing snapshot now fails explicitly. The unchanged
INVITE lifecycle was not rerun. Existing pg parallel-query deprecation warning
remains; this is not warning-free evidence. No provider/model/email or real job.

## Browser/source verification

Desktop owned tab62 over exact authenticated QA-only temporary local route.
Real returned native command DTOs (UTC timestamps, original reviews/current states)
render using production StaffInvitationContent. Resend displays Queued/zero attempts/
INVITED; revoke displays REVOKED/INVITED and no new notification. Revocation label
now says 'Not requested by this revocation' rather than ambiguous missing-record text.
Shared reason editor blank/whitespace refusal now says 'Enter a reason.'; valid
local reason Save retains exact REVOKE invitationId/kind, does not execute command.
Existing500-character limit unchanged with plain-language length error.

Screenshots in artifacts/assistant-operations-web:

- s02-resend-receipt-source-web.jpg
- s02-revoke-receipt-source-web.jpg
- s02-lifecycle-reason-validation-web.jpg
- s02-lifecycle-reason-save-web.jpg

Zero captured warn/error logs. Tab62 and temporary source removed; ignored preview
sources/evidence retained. This is source preview of real rolled-back DTOs, not saved
chat/HTTP receipt availability or live assistant confirmation acceptance. User tab
untouched; no mobile/device/viewport testing. Scoped verifier TypeScript and three
new verifier-file Biome checks pass; two touched production UI Biome checks pass.
No broad/unnecessary repeated suite.

Remaining: trusted provider reconciliation, custody privacy/retention inventory,
actual controlled queue/email acceptance, concurrency/seat refusal and full saved
chat/Edit/re-review/Confirm/global object acceptance. Source capabilities planned;
no parent acceptance bookmark added. E05 persistent activation/API restart approval
still unanswered, not retried. No schema/permission/public endpoint/new credential/
ACTIVE staff/committed fixture/deletion/runtime restart/push/deploy.

Brain impact: assistant invitations/operations features, S02/canonical plans,
in-progress/roadmap task ledgers and API contract (receipt label only). No schema,
relationship/migration, public endpoint, permission or durable architecture change.
