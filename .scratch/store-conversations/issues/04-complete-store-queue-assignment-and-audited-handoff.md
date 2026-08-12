# 04 — Complete Store Queue Assignment And Audited Handoff

**What to build:** Give Store teams a reliable shared conversation queue with
one primary attendant, guarded human replies, reasoned reassignment and handoff,
membership revocation, overdue escalation, and clear separation between
ordinary conversation responsibility, pharmacist release, and Quote approval.

**Blocked by:** 03 — Support Multiple Typed Requests In One Store Conversation

**Status:** ready-for-agent

- [ ] Queue rows are Tenant/Store scoped and expose only safe summary, latest
      customer activity, unread/current Request state, assignment, and SLA facts.
- [ ] Queue filters, sorting, selected conversation, and detail state are
      URL-owned and survive refresh/Back/Forward through the established
      dashboard composition pattern.
- [ ] Claim uses row-locked, payload-bound idempotency and permits exactly one
      active eligible primary attendant under concurrent attempts.
- [ ] Replies recheck active Membership, Store assignment, primary ownership,
      conversation/source revision, policy, and moderation immediately before
      append; stale concurrent replies produce typed recovery rather than
      conflicting customer messages.
- [ ] Release, reassignment, and handoff require a bounded reason and append an
      immutable actor/time/from/to audit event.
- [ ] Membership suspension/removal immediately removes read/reply/assignment
      eligibility and safely releases or escalates affected assignments.
- [ ] Pharmacist clinical release, attendant assignment, and commercial Quote
      approval remain independent; holding one role never grants another.
- [ ] Customer-visible sender defaults to the Store and may show only an
      explicitly approved public first name, never private staff identity.
- [ ] Unclaimed, overdue, abandoned, and failed-response conditions create
      bounded escalation facts and recovery actions without exposing staffing
      detail to customers.
- [ ] Queue/detail/form close and success behavior resets only owned URL/form
      state and invalidates exact touched queries.
- [ ] Focused concurrency and permission tests plus verified-database acceptance
      prove claim/replay, handoff, membership removal, role composition,
      cross-Store isolation, and immutable audit.
- [ ] Authenticated desktop and compact-mobile dashboard acceptance covers
      loading/empty/error/retry, queue claim, reply conflict, handoff, removal,
      long timelines, keyboard/focus, and privacy-safe rows.
- [ ] Brain API, permission, schema, relationship, feature, and task records
      describe the final Store-team conversation boundary.
