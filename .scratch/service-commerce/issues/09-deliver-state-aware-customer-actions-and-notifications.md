# 09 - Deliver State-Aware Customer Actions And Notifications

**What to build:** Project and deliver only the customer actions valid for the current source version, Store capabilities, vertical policy and channel, including Request quote, Book, Pay now, Pick up, Delivery and Talk to staff.

**Blocked by:** 04 - Generalize WhatsApp Connection And Location Binding; 06 - Reuse Quote Payment And Order Conversion; 07 - Add Booking And Appointment Lifecycle; 08 - Extract Shared Pickup And Delivery Fulfilment; 11 - Enforce Vertical And Jurisdiction Eligibility.

**Status:** approved; blocked

**Approval:** Owner-approved on 2026-08-09. Start only after every listed blocker is complete.

- [ ] Define one exhaustive server-side action registry keyed by typed state/capability/policy rather than UI string switches.
- [ ] Generate opaque, expiring, single-purpose, idempotent capabilities bound to the current internal version and Store.
- [ ] Keep sensitive data, Tenant/Store ids and raw bearer capabilities out of button payloads, logs and analytics.
- [ ] Revalidate source, current version, expiry, fulfilment, role and vertical eligibility on every action command.
- [ ] Make payment, booking and fulfilment confirmation explicit commands; button clicks and link navigation are not business truth.
- [ ] Render channel-appropriate web/WhatsApp actions with safe stale/expired recovery and a direct human escalation path.
- [ ] Persist provider-neutral intents and idempotent attempt/receipt facts with template and service-window enforcement.
- [ ] Test every action's positive, stale, consumed, cross-Tenant, disabled, provider-failure and replay path.
