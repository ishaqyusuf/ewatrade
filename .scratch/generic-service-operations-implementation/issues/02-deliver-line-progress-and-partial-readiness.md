# 02 — Deliver Job Line progress and partial readiness

**What to build:** Let workers progress individual Job Lines through the generic
work lifecycle while each Service Job presents a truthful derived summary,
including blocked and partially ready work.

**Blocked by:** 01 — Deliver direct Service Intake through Order and tracked work

**Status:** source-complete-pending-behavioral-validation

- [ ] Job Lines support the approved queued, in-progress, blocked, ready-for-handoff, completed, and cancelled transitions.
- [ ] Every transition is revision-guarded and records actor, effective/recorded time, source, and reason where required.
- [ ] Job summary is derived from line states and cannot be edited independently.
- [ ] Partial readiness and mixed terminal/active line combinations produce deterministic internal and customer-safe milestones.
- [ ] Pickup, delivery, remote handoff, delay, and failed attempt are typed events rather than industry-specific primary states.
- [ ] Mobile and dashboard Job Workspace prove simple, fast-completion, blocked, partial-ready, and terminal flows.
