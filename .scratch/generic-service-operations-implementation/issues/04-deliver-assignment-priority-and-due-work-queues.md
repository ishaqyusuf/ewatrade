# 04 — Deliver assignment, priority, and due-work queues

**What to build:** Give managers one audited primary Job assignee, normal/urgent
priority, merchant Due Commitments, reasoned rescheduling, and actionable
due/overdue work queues without introducing appointments or capacity planning.

**Blocked by:** 02 — Deliver Job Line progress and partial readiness

**Status:** source-complete-pending-behavioral-validation

- [ ] Assignment is limited to active authorized Business members with Store access and preserves reassignment history.
- [ ] Normal/urgent priority affects queue ordering only and never changes price.
- [ ] One current optional Job-level Due Commitment is inherited by lines and remains distinct from requested time.
- [ ] Rescheduling records old/new promise, actor, reason, and timestamps without editing history.
- [ ] Due-today/overdue projections use Store timezone and incomplete work, never payment state.
- [ ] Dashboard/mobile queues support filters, empty/loading/error/permission states, and access to Job Workspace.
