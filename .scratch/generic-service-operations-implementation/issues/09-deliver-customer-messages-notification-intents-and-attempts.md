# 09 — Deliver Customer Messages, Notification Intents, and Delivery Attempts

**What to build:** Let approved Service events create deduplicated communication
intent, render customer-safe messages, record manual sharing or provider
attempts, and retry failures without duplicating the original intent.

**Blocked by:** 04 — Deliver assignment, priority, and due-work queues; 08 — Deliver safe customer tracking and published updates

**Status:** source-complete-pending-behavioral-validation

- [ ] Offering Guidance, Intake Instructions, Internal Work Notes, and Customer Messages remain distinct contracts and audiences.
- [ ] Notification Intent is deduplicated by business event, audience, and template purpose.
- [ ] Rendered message snapshots approved customer-safe content independently from internal work notes.
- [ ] Manual sharing and each provider Delivery Attempt have independent status, timestamps, failure, and retry history.
- [ ] Provider failure or manual fallback does not create a second intent or mutate work truth.
- [ ] Capability, privacy, idempotency, ready/delay/revised-promise, and unsupported-provider tests pass.
