# 16 - WhatsApp Commerce Actions And Notifications

**What to build:** Deliver neutral prescription-commerce notifications and context-safe WhatsApp actions for quote review, pickup, delivery, pharmacy questions, payment, receipts, readiness, and delivery updates while preserving the web flow as the secure system of action. Follow Midday's notification-intent, durable-job, shared-package, session-window, and interactive-message architecture with connection-scoped pharmacy senders.

**Blocked by:** 11 - Hosted Payment, Receipts, Retries, And Refunds; 12 - Pickup Preparation And Handoff; 14 - Delivery Assignment And Execution; 15 - Manual Pharmacy WhatsApp Connection And Inbound Intake

**Status:** implemented-source; live Meta/template canary pending

- [ ] Provider-neutral notification intents map to per-WABA approved templates and active customer-service-window behavior.
- [ ] Prescription, Quote, Payment, and Fulfilment domains record or enqueue provider-neutral communication intent only; they do not call Meta, construct Graph API requests, or wait for provider delivery.
- [ ] Durable notification jobs carry identifiers and tenant/store context rather than hydrated sensitive records, reload current Quote/Order/connection state through package/query APIs, and delegate delivery to the shared Communications package.
- [ ] Each job dynamically resolves the correct pharmacy connection, credential reference, `phone_number_id`, template version, and language; no global sender environment value is used for multi-pharmacy dispatch.
- [ ] Per-connection/customer `lastSeenAt` controls Midday-style session behavior: free-form text and reply buttons are allowed only inside the active window, while approved templates or a recorded deferred/manual state are used outside it.
- [ ] Message copy is neutral and does not reveal medicine names, prescription contents, diagnoses, addresses, or payment details in chat previews.
- [ ] Interactive quick options include Pick up, Delivery, Ask pharmacy, and Review & pay only when valid for the current Quote or Order state.
- [ ] Quick-action payloads are opaque, scoped, expiring where appropriate, idempotent, and revalidated against current tenant/store/entity state when received.
- [ ] Review & pay opens the secure current web flow; WhatsApp never collects raw payment credentials or bypasses total confirmation.
- [ ] Quote ready, clarification, payment receipt, pickup ready, delivery progress, failed delivery, and expiry events use the correct pharmacy-owned sender.
- [ ] Provider attempts, Meta message ids, delivery/read receipts, retries, final outcomes, and deduplication identities are recorded separately from the domain communication intent.
- [ ] Missing templates, expired windows, provider failures, retries, duplicates, superseded quotes, and invalid actions have safe fallback behavior.
- [ ] Package, job, API, session-window, adapter-contract, and end-to-end tests cover customer actions from both pickup and delivery journeys across multiple pharmacy connections.
