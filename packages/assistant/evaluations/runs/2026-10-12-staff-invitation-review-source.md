# S02 invitation review and native guard source — 12 October 2026

Status: source milestone only; S02 partial and unbookmarked. Full45-ticket goal active.

## Delivered

Strict normalized email/name,1–100 Store assignments with native roles, starting Store
and explicit catalog grant. Canonical read-only RepeatableRead10s/30s transaction
and caller-owned seam. Reuses QA identity/active Store validation and complete native
subscription snapshot, including counted pending/suspended seats. Fresh ACTIVE
Owner/Admin on active Tenant, exact same-Tenant membership projection and Store names.
Preview includes current membership revision, intended INVITED role/access, seat
impact, rollout/recipient/quota blockers and explicit email side effect. No seat
reservation, credentials, invitation/token creation, enqueue or activation.

Native invitation now checks actor authority under lock before replay or user writes,
locks the exact existing recipient before reading role/status, rejects protected
OWNER/ADMIN/SUPPORT/MEMBER before mutation, and retains active-staff conflict.
`inviteRetailOpsStaffInTransaction` joins callers without nested transactions;
root wrapper10s/30s. Native Store-access actor guard and assignment validation are
shared. Protected tRPC read + planned dashboard-only GENERAL review capability,
explicit Owner/Admin domain guard and bounded safe answer. Native error mapping
handles Store authority/invalid-input errors.

## Verification

-31focused tests130assertions across review/input, native invite/onboarding,
 shared Store access and saved answer bounds; final exit0.
-Scoped owned source/types pass; no broad workspace/mobile typecheck.
-Actual protected tool callbacks in `ewatrade_qa_v1` under exact classified QA
 Owner/Store/conversation guards. New normalized QA recipient and original Owner
 membership preview available as read DTOs, but rollout correctly blocks invitation
 availability; Owner also has protected-role blocker. Foreign active QA Store refused.
-Actual canonical native invitation refused existing protected Owner before token/
 membership mutation. Transaction-local actor suspension refused both review and
 native invitation. Forced rollback; full saved memberships/profiles/assignments/
 invitations/access/lifecycle/users/sessions/accounts/Tenant/chat/messages/proposals/
 runs/budget SQL hash unchanged.15.405s, terminal session43679exit0. No provider or
 notification; test-process read visibility restored finally.
-Initial restricted network attempt terminally failed before DB access. Next attempt
 found missing GENERAL domain guard; corrected guard, then successful run above.
 No process restart or transaction timeout increase.
-Desktop actual original protected DTOs rendered through current GeneralAnswerCard;
 current summary projection explicitly shows invitation-email side effect, rollout
 block and protected recipient. Three cards; no confirmation/Open/invite controls.
 Browser warning/error capture empty. Screenshot `s02-invitation-review-web.jpg`.
 Current projection saved separately; original real-read response remains intact.
 Guarded temporary QA route and owned tab60 removed; ignored previews retained.

## Remaining and boundaries

S02 still requires signed review/Edit/Confirm, durable command/outbox, explicit
resend/revoke, delivery/acceptance/expiry states, duplicate/quota concurrency,
enqueue failure/lost-response replay and saved web confirmation/recovery.
The current native metadata replay and post-commit enqueue remain insufficient.
No saved assistant/chat flow or live HTTP availability certified. Read capability
remains planned. No schema/migration, mobile, paid model/provider call, email,
credential creation, persistent activation, API restart, fixture deletion, push or
hosting change. Pending E05 activation/restart approval unchanged.

Roadmap13/45accepted28.9%,32awaiting71.1%:13partial18pending1deferredA04.
Brain impact: staff feature/native guard, API contracts/endpoints/permissions,
implementation decision and task state. Database schema/relationships unchanged.

Artifacts: `s02-invitation-real-reads.json`, `s02-invitation-render-answers.json`,
`/private/tmp/s02-invitation-real-reads.log`, `/private/tmp/s02-invitation-tests.log`.
