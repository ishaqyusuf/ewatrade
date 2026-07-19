# 11 — Remove the Service prototype and reset development state

**What to build:** Delete every rejected prototype and compatibility surface,
move all clients to the new Service Operations contracts, reset disposable
database/local state, and leave one coherent implementation.

**Blocked by:** 06 — Deliver offline Intake, work execution, and conflict review; 08 — Deliver safe customer tracking and published updates; 09 — Deliver Customer Messages, Notification Intents, and Delivery Attempts; 10 — Deliver Service reports, audit, and operational observability

**Status:** source-complete-pending-behavioral-validation

- [ ] Old Service profile/fulfillment enum, singular Job relations, status/request/notification shapes, URL evidence, direct Request conversion, legacy ids/readers, and metadata fallbacks are removed.
- [ ] Generic Retail Ops Service permissions and duplicated marketing/storefront routes are replaced by approved boundaries.
- [ ] Old Service caches and queued events are discarded; unsupported old clients fail closed.
- [ ] Development database reset, generated clients, repository migration workflow, required database push profiles, and neutral seeds complete without preservation logic.
- [ ] Repository searches find no compatibility alias, dual write, old event reader, or industry runtime schema/API/permission/navigation/report branch.
- [ ] Conflicting Brain schema/API/feature/ADR/task documentation is superseded or updated.
