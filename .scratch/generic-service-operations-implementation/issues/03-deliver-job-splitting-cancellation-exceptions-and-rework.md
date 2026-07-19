# 03 — Deliver Job splitting, cancellation, exceptions, and rework

**What to build:** Let managers explicitly split uncompleted exact quantities
into additional Jobs, record operational exceptions, cancel work independently
from refunds, and create linked rework without rewriting completed history.

**Blocked by:** 02 — Deliver Job Line progress and partial readiness

**Status:** source-complete-pending-behavioral-validation

- [ ] One Order may own multiple Jobs and one Order line may allocate across multiple Job Lines without loss or over-allocation.
- [ ] Split is atomic, revision-guarded, limited to eligible uncompleted quantity, and fully audited.
- [ ] Delay, quality exception, failed attempt, and customer rejection have typed records/outcomes.
- [ ] Operational cancellation does not issue refunds; Commerce cancellation/refund does not silently rewrite completed work.
- [ ] Pre-completion rework is a reasoned transition and post-completion rework creates a linked cycle/allocation.
- [ ] Conservation, concurrency, terminal-history, and cross-Store isolation tests pass.
