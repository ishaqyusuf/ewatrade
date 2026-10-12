# S02 durable invitation source — 12 October 2026

S02 remains partial/unbookmarked; no new parent acceptance. Roadmap13/45 accepted,
32awaiting:13partial18pending1mobile-deferred. No model/provider/email/mobile run.

Canonical INVITE/RESEND/REVOKE commands atomically save invitation facts, immutable
safe receipt and encrypted outbox. Tenant-scoped command identity, fresh actor,
review digest, native Store/QA/seat checks and shared Tenant seat lock preserve
canonical authority. Same payload replays original receipt before rollout/key
configuration; changed payload conflicts. Initial invite refuses existing non-removed
members; explicit resend/revoke target exact pending lifecycle. Resend preserves
membership grants, revokes old tokens and cancels unsent work. Revoke records
INVITE_REVOKED; membership stays INVITED and still consumes a seat.

Versioned AES-256-GCM envelope freezes email content and acceptance link with scope/
payload AAD. Explicit active key/key ID and bounded retired keyring; no approval-key
reuse. Safe recovery projects IDs/lifecycle/notification states, no token/ciphertext.

ID-only worker seam claims bounded work, decrypts only after claim, checks frozen
recipient/access/token, invokes provider policy before a final fresh send fence,
and carries stable provider idempotency. No live transport/scheduler registered.
Claimed crashes may safely reclaim before send; SENDING lease expiry becomes unknown,
not retryable. Known acceptance is SENT, distinct from verified fixture delivery.
Late matching receipt resolves unknown. Changed grants/actor/link cancel unsent work.
Three-attempt bound, cancellation and terminal payload erasure. Post-send uncertainty
cannot be relabeled as a pre-send retryable failure.

## Validation

- Focused40tests191assertions pass (39tests186 consolidated; additional transition
  regression and seven notification tests51assertions final). Scoped owned types pass.
- Exact owned classifiedewatrade_qa_v1/activeOwner/Store guarded, four sequential
  transactions retainmaxWait10s/timeout30s. Actual native command/outbox facts:
  invite/replay18.638s; resend/replay11.465s; revoke/replay10.143s; claim/unknown/late
  simulated verified receipt17.731s. Each reaches injected rollback; saved Tenant,
  memberships/profiles/assignments/invites/lifecycle/access, commands/outbox/attempts,
  all Tenant staff Users/sessions/accounts, conversations/messages/proposals/runs and
  full budget SQL snapshots unchanged. All fixtures
  rolled back, no credential or active membership, no real delivery evidence.
- Initial snapshot used nonexistent AssistantChat table; failed before fixture creation.
  Corrected to actual AssistantConversation and reran. Expanded snapshot initially
  used nonexistent budget id/Tenant fields; failed before fixtures. Corrected to
  scopeKey/full budgets and reran. Final suite5714exit0 supersedes earlier narrower
  evidence; only corrected successful runs establish database evidence.
- Prisma-generated/applied20261012051812_staff_invitation_commands; root
  `TERM=xterm-256color bun run db:migrate --local -- --name staff_invitation_commands`
  and required `bun run db:push --local` exit0, latter already in sync. Baseline129
  migrations all applied; foreign schema hashes unchanged. Additive three tables/
  two enums/revoke lifecycle value/composite key only; no manual SQL/reset/data-loss.
  TERM=dumb caused prior interactive failures, no schema applied by those attempts.
- Existing pg adapter emits parallel-query deprecation warning; successful run not
  warning-free. No connection/transaction budget expansion.

## Remaining acceptance

Signed assistant editor/review/confirm, original grant receipt, registered guarded
provider/scheduler/reconciliation, exact quota/duplicate concurrency/refusal evidence,
privacy retention inventory and full saved dashboard chat/global object remain open.
No persistent assistant activation, API restart, hosted change, push or deployment.
E05 activation/restart approval still unanswered; rejected actions not retried.
Latest invitation review screenshot remains the prior read preview, not new command
confirmation evidence: artifacts/assistant-operations-web/s02-invitation-review-web.jpg.

Fixture: [lifecycle v1](../fixtures/staff-invitation-lifecycle.v1.json).
Source SQL/worker checks and this catalog retained in Git; raw QA artifacts ignored.
