# 10 — Deliver Service reports, audit, and operational observability

**What to build:** Give managers operational and commercial Service reporting
from the correct immutable sources, plus audit and observability for queues,
conflicts, public access, evidence actions, and communication attempts.

**Blocked by:** 03 — Deliver Job splitting, cancellation, exceptions, and rework; 04 — Deliver assignment, priority, and due-work queues; 06 — Deliver offline Intake, work execution, and conflict review; 07 — Deliver public Service Requests and versioned Quotes; 09 — Deliver Customer Messages, Notification Intents, and Delivery Attempts

**Status:** source-complete-pending-behavioral-validation

- [ ] Commerce supplies revenue, discounts, refunds, paid amount, and balance from immutable Order/payment records.
- [ ] Work events/allocations supply WIP, queue age, cycle time, overdue, on-time, blocked, readiness, throughput, cancellation, exception, rework, and workload metrics.
- [ ] Request/Quote funnel and notification intent/manual/provider delivery metrics use their own histories.
- [ ] Current Catalog edits never rewrite historical report dimensions.
- [ ] Evidence contents are excluded; scoped metadata/access/publication/revocation events remain auditable.
- [ ] Tenant/Store privacy, timezone, exact quantity, pagination/export, offline backlog, and reconciliation tests pass.
