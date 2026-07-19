# 06 — Deliver offline Intake, work execution, and conflict review

**What to build:** Let staff create/confirm Intake, progress work, add internal
notes, assign themselves, and capture evidence offline using versioned commands
that replay idempotently and surface stale actions for review.

**Blocked by:** 03 — Deliver Job splitting, cancellation, exceptions, and rework; 04 — Deliver assignment, priority, and due-work queues; 05 — Deliver managed private Service Evidence and publication; Generic Inventory 10 — Deliver offline Catalog, stock, and sale conflict review

**Status:** source-complete-pending-behavioral-validation

- [ ] Local Service schema uses stable client ids, dependency ids, event versions, exact quantities, expected revisions, and provisional status.
- [ ] Confirmation, transitions, notes, self-assignment, and evidence capture replay idempotently in dependency order.
- [ ] Public requests, Quotes, payments, evidence publication, token management, and communication dispatch remain online-only.
- [ ] Stale Offering/price, revision, transition, assignment capability, promise, evidence, and unsupported-client outcomes are typed conflicts.
- [ ] Conflict review shows attempted action, authoritative state, reason, dependent commands, and safe retry/discard guidance.
- [ ] Old Service caches/events are reset and no compatibility reader interprets them.
