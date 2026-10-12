# S02 verified invitation reconciliation — 12 October 2026

S02 remains partial/planned/unbookmarked. Accepted roadmap remains 13/45 (28.9%);
32 await acceptance (13 partial,18 pending,1 deferred mobile). No model run.

## Implementation

POST `/api/staff/invitations/webhooks/resend` is registered in source, default-off
unless `STAFF_INVITATION_RECONCILIATION_ENABLED=true` and dedicated
`STAFF_INVITATION_RESEND_WEBHOOK_SECRET` are explicitly configured. Receiving is
independent of sending so callbacks can be received while dispatch is paused.
The installed Resend SDK verifies untouched raw bytes with Svix identity/time/signature
before strict validation. No SDK provider request occurs during verification.
64KiB body limit; unrelated verified categories/types ignored; invalid signature401,
invalid recognized facts/destination400, unbound/conflicting receipt409, DB failure503
without raw SQL/provider/content in responses. No browser/model delivery mutation.

Canonical worker generates original Tenant/notification/payload-hash tags, and guarded
email routing appends SHA256 of the actual single routed destination. Callback requires
matching signed destination digest. Links/tokens/content/creator approval never enter tags.
Tags are trusted only behind the endpoint signing secret and original DB identity/send
fence; this is not an independent cryptographic provider-account attribution protocol.

Shared internal lock preserves Tenant SHARE then exact outbox UPDATE/member/token SHARE.
Only SENDING/OUTCOME_UNKNOWN/SENT/DELIVERED with current claim, original sendStartedAt,
attempt and hash may bind; known provider IDs never replaced. SENT means provider accepted
the email request, including delivery suppression/failure; it does not certify inbox receipt.
DELIVERED only from matching signed delivery. Provider creation/event times must be finite,
ordered and bounded by send start/current-time five-minute clock tolerance. Earliest trusted
acceptance/delivery timestamps reconcile callbacks before local worker persistence. Late
worker completion/replayed callbacks retain original receipt and delivery issue. Creator/link
revocation after sending does not erase authentic provider facts or activate staff.

Bounced/failed/complained/suppressed project safe failure codes on SENT/DELIVERED, never
retryable FAILED. Delivery fact is monotonic. Issue precedence is deterministic:
complaint > bounce > suppression > failure; later sent/delivered cannot clear the issue.
This preserves a reported issue, not a complete ordered provider-event audit log. No new
schema/event ledger, failure timestamp or provider payload retention. Privacy inventory,
retention and operator resolution remain acceptance gates. Verified acceptance erases
ciphertext; unknown without verified evidence remains stopped under existing policy.

Provider format references: [raw signature verification](https://resend.com/docs/webhooks/verify-webhooks-requests),
[per-recipient tags/event visibility](https://resend.com/changelog/webhook-event-visibility),
[suppression event](https://resend.com/changelog/email-suppression-visibility).

## Verification

- 31 focused tests,216 assertions: real installed SDK signatures, raw-body tamper,
  stale time, wrong secret/missing headers, six event types, destination/scope/hash,
  default-off/missing settings,64KiB limit, generic persistence failure/replay;
  canonical uncertainty/receipt ordering and all touched worker/routing regressions.
- Scoped changed-source/verifier/test TypeScript passes;13-file Biome check passes.
- Exact owned classified QA database `ewatrade_qa_v1`, Tenant
  `cmuzedcda000hbw9kd6e50z8u`, current Owner and Store checked in seed SQL.
  Real signed HTTP callback invokes canonical query inside one caller-owned bounded
 10s/30s transaction; synthetic INVITED fixtures only, no root/nested call inside tx.
- Authoritative process86333 exit0: unknown→delivery/replay21.258s;
  worker-local timestamp→earlier provider delivery/complaint/late sent25.888s;
  unsent/hash/foreign scope/old timestamp refusal14.089s. Total62.983s.
  All writes forcibly rolled back. Full saved staff/auth/chat/budget facts unchanged
  after each; refusal/replay stages compared byte-equivalent snapshot hashes.
  Conflicting known provider message409 and late original worker completion checked.
- Known pg parallel-query deprecation warning remains; no transaction timeout or expansion.
- Actual dashboard production receipt component renders native canonical DTOs from these
  transactions. Delivered, reported spam and revoked-link-after-send states show INVITED
  membership and distinct invitation/email facts; zero captured browser warnings/errors.
  Source preview only, not saved HTTP/chat/general flow or actual provider acceptance.
  Guarded temporary route and owned tab63 removed.

Screenshots (local ignored artifacts):
`artifacts/assistant-operations-web/s02-provider-delivered-web.jpg`,
`s02-provider-complained-web.jpg`, `s02-provider-revoked-web.jpg`.
Result: `artifacts/assistant-operations-web/s02-provider-reconciliation-rollback.json`.
Reproduce using `node artifacts/assistant-operations-web/staff-invitation-provider-rollback.mjs`:
root local profile/Production identity guard, exact database, ephemeral custody key/secret,
forced rollback; no secret output. Source verifier is versioned.

No actual provider/model/mail/task/queue request, persistent key/flag/ACTIVE grant,
fixture deletion, API restart, migration, mobile, push or deployment. Stable saved
web acceptance, controlled mail/queue, privacy policy and concurrency remain open.
The E05 activation/API-restart approval remains unanswered and was not retried.
