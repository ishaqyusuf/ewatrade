# 07 - Add Booking And Appointment Lifecycle

**What to build:** Add a typed Store-scoped booking capability for Service Commerce, including resources, availability, holds/confirmation, payment policy, reminders, reschedule, cancellation and completion.

**Blocked by:** 02 - Configure Business Capability Profile; 03 - Establish Customer Request Interoperability Contract; 06 - Reuse Quote Payment And Order Conversion.

**Status:** approved; blocked

**Approval:** Owner-approved on 2026-08-09. Start only after every listed blocker is complete.

- [ ] Model bookable Offerings, resources, Store timezone, availability rules, exceptions, duration, lead time and capacity with explicit ownership.
- [ ] Represent scheduled, confirmed, arrived, in-service, completed, cancelled and no-show states independently from payment state.
- [ ] Make slot hold/confirmation atomic and concurrency-safe so exclusive capacity cannot be double-booked.
- [ ] Snapshot booking, deposit/full-payment, cancellation and refund policy at confirmation.
- [ ] Support authorized, revision-guarded reschedule/cancel commands with structured reasons and audit history.
- [ ] Create provider-neutral confirmation/reminder/change intents and identifier-only jobs that re-authorize at execution.
- [ ] Integrate eligible Request, Quote, Order and Service Job relationships without making booking a JSON field or prescription state.
- [ ] Add dashboard/public Midday-style loading, error, empty, stale and mobile/accessibility coverage.
- [ ] Test timezone/DST boundaries, contention, expiry, replay, cancellation/refund and notification failure recovery.
