# 04 — Complete Store Queue Assignment And Audited Handoff

**What to build:** Give Store teams a reliable shared conversation queue with
one primary attendant, guarded human replies, reasoned reassignment and handoff,
membership revocation, overdue escalation, and clear separation between
ordinary conversation responsibility, pharmacist release, and Quote approval.

**Blocked by:** 03 — Support Multiple Typed Requests In One Store Conversation

**Status:** complete

- [x] Queue rows are Tenant/Store scoped and expose only safe summary, latest
      customer activity, unread/current Request state, assignment, and SLA facts.
- [x] Queue filters, sorting, selected conversation, and detail state are
      URL-owned and survive refresh/Back/Forward through the established
      dashboard composition pattern.
- [x] Claim uses row-locked, payload-bound idempotency and permits exactly one
      active eligible primary attendant under concurrent attempts.
- [x] Replies recheck active Membership, Store assignment, primary ownership,
      conversation/source revision, policy, and moderation immediately before
      append; stale concurrent replies produce typed recovery rather than
      conflicting customer messages.
- [x] Release, reassignment, and handoff require a bounded reason and append an
      immutable actor/time/from/to audit event.
- [x] Membership suspension/removal immediately removes read/reply/assignment
      eligibility and safely releases or escalates affected assignments.
- [x] Pharmacist clinical release, attendant assignment, and commercial Quote
      approval remain independent; holding one role never grants another.
- [x] Customer-visible sender defaults to the Store and may show only an
      explicitly approved public first name, never private staff identity.
- [x] Unclaimed, overdue, abandoned, and failed-response conditions create
      bounded escalation facts and recovery actions without exposing staffing
      detail to customers.
- [x] Queue/detail/form close and success behavior resets only owned URL/form
      state and invalidates exact touched queries.
- [x] Focused concurrency and permission tests plus verified-database acceptance
      prove claim/replay, handoff, membership removal, role composition,
      cross-Store isolation, and immutable audit.
- [x] Authenticated desktop and compact-mobile dashboard acceptance covers
      loading/empty/error/retry, queue claim, reply conflict, handoff, removal,
      long timelines, keyboard/focus, and privacy-safe rows.
- [x] Brain API, permission, schema, relationship, feature, and task records
      describe the final Store-team conversation boundary.

## Evidence

- Shared, repository, API and URL-state checks pass 20 tests / 53 assertions;
  the focused scheduler/customer-channel checks pass 14 / 52. Direct package
  typechecks and scoped Biome checks pass.
- Canonical verified-Neon acceptance passes 3 tests / 42 assertions, including
  concurrent primary claim, audited non-primary read, handoff, membership
  revocation, automatic release and immutable escalation evidence.
- After the starvation-safe exact-dedupe scan was added, the affected
  assignment/escalation Neon case passed independently at 1 test / 13
  assertions; the fixture cleaned normally.
- The established authenticated 1280x720 and 390x844 browser baseline covers loaded and empty
  queues, controlled API error/retry recovery, claim/reply, typed URL
  Back/Forward, focus restoration, handoff, membership-removal release,
  privacy-safe rows and a 17-message internally scrollable sheet without page-
  level overflow. The final Midday table/form extraction is source-, unit-,
  format- and type-verified. Its bounded browser rerun was inconclusive after
  the task-owned development route stopped responding, so it is not reported
  as a new pass. Both the acceptance and browser fixtures were removed; exact
  cleanup verified zero run-owned Tenant/User rows.
- Prisma generated and applied the additive Ticket 04 artifact to verified
  development Neon; migration status reports all 50 artifacts current. No
  production migration/provider/switch/contraction action was performed.
