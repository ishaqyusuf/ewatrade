# S02 signed invitation and global receipt source — 12 October 2026

S02 remains partial/unbookmarked. Full roadmap13/45accepted28.9%,32awaiting71.1%
(13partial,18pending,1deferredA04). Web/dashboard only. New capabilities planned.

## Implemented

Strict INVITE/RESEND/REVOKE shared action, natural recipient/Store instructions,
fresh Owner/Admin domain guard and canonical adapter. Current canonical review
hash binds recipient, original membership/access, every Store/role/name, starting
Store, catalog editing, seat availability and lifecycle/reason. Review blockers
remove approval; native command/access errors map to public tRPC codes. Confirmation
joins one bounded transaction with durable command/outbox and proposal completion.

Original safe review details are stored in command result JSON. Exact command
read returns that immutable receipt separately from current membership,
invitation and notification states; old receipts explicitly lack original review.
Exact-member discovery returns request-snapshot total/latest ten with explicit
limitation, expiry and notification status, no raw links/custody/provider IDs.

Native protected procedures: retailOps.staffInvitationCommandReview,
staffInvitationCommandSave,staffInvitationCommand,staffInvitations. No provider
or enqueue in these procedures. Three new planned dashboard Owner/Admin
capabilities register this boundary; prompt version general-v19.

Dedicated proposal editor handles authorized Store reads, recipient/name,
per-Store roles, starting Store, explicit catalog editing and resend/revoke reason.
Strict command-only Open target, URL hook, Open button, content and shell-owned
sheet. Loading/unavailable/retry/refresh/invalid links, sibling staff handoff and
receipt navigation preserve unrelated assistant/chat URL state. Original facts,
current states, unknown sending, absent legacy details and provider acceptance vs
actual delivery are explicit.

## Verification

Focused `bun test` on staff-invitation action, canonical command/receipt and API
review:8tests66assertions pass. Scope-only TypeScript passes, and Biome checks on eight new production files pass. No broad/mobile suite.

Actual isolated ewatrade_qa_v1, exact classified QA Owner/Store/saved GENERAL chat.
Test-process manifest visibility only and ephemeral signing/custody keys. Real
server-generated approval with transaction-local proposal; real
`decideGeneralProposal`/fresh session/workspace/age/privacy/legal checks and durable
canonical invitation execute to COMPLETED. Original CASHIER/INVITED/Store/default/
catalog/seat/hash receipt, encrypted queued outbox, zero attempts/credentials/
sessions, current protected canonical command read and exact-member discovery
verified inside transaction, then forced rollback. No nested/root calls within
transaction; maxWait10s/timeout30s unchanged.

Final authoritative run36067exit0:

- Signed completion and native receipt/discovery:22.808s.
- Changed approval token refusal:3.925s.
- Real Store-label change after original review refusal:7.672s.

Every case restores complete saved Tenant/staff profiles/assignments/invitations/
lifecycle/access/commands/outbox/attempts/Tenant staff users/sessions/accounts/
conversations/messages/proposals/runs/budget snapshots. No committed fixtures,
provider/model calls or emails. The stale Store-label change also rolls back.
Existing pg parallel-query deprecation warning remains; not warning-free.
Initial sandbox network check failed before any fixture, escalation run passed.
Earlier synthetic digest-only stale case is superseded by actual Store-label check.

Desktop real rollback DTO/source form validation: edit recipient/name; CASHIER
catalog grant refused; MANAGER+catalog grant accepted by local form. Original
receipt remains CASHIER/catalog false independently of local edited fields.
Original receipt/current queued state screenshot uses actual native canonical DTO
with UTC dates from preceding verified run28218 (completion22.573s). Final run36067
supersedes its artificial stale digest with an actual Store-label change. Zero captured warnings/errors in source preview. Global sheet
Open/unavailable/Close over /assistant retains selected saved chat reference/title;
chat content still cannot load. Stable API log shows staffInvitationCommand
NOT_FOUND. This is source/rollback evidence, not saved HTTP success or signed
browser confirmation. Temporary guarded source preview and owned tab61 removed.

Screenshots (locally ignored):

- artifacts/assistant-operations-web/s02-invitation-editor-web.jpg
- artifacts/assistant-operations-web/s02-invitation-receipt-source-web.jpg
- artifacts/assistant-operations-web/s02-invitation-over-assistant-web.jpg
- artifacts/assistant-operations-web/s02-invitation-close-retains-assistant-web.jpg

Midday conformance: customer details/params/global shell pattern, thin typed query
sheet, dedicated hook/Open/content/editor, shared UI and strict API/domain layers.
No standalone page/list table/bulk controls fit an exact invitation receipt.
Existing proposal mutation owns Save/review and conversation invalidation.

## Remaining

Full draft/Edit/re-review/signed Confirm browser acceptance, signed resend/revoke
and completed recovery, real saved receipt and chat continuity, guarded mail
transport/discovery/reconciliation, complete seat/duplicate/stale concurrency,
privacy retention/deletion inventory and unknown ciphertext policy. No persistent
availability, API restart, mobile, schema change, push or deployment this turn.
Unanswered E05 enable/restart approval remains pending; no rejected action retried.
