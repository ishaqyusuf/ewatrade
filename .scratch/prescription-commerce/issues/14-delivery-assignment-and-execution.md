# 14 - Delivery Assignment And Execution

**What to build:** Add the operational delivery lifecycle for eligible, paid, prepared prescription orders, including courier assignment, pharmacy handoff, transit, delivery proof, failure, rescheduling, and customer-service recovery.

**Blocked by:** 11 - Hosted Payment, Receipts, Retries, And Refunds; 12 - Pickup Preparation And Handoff; 13 - Delivery Zones And Payable Delivery Quotes

**Status:** implemented-source; delivery SOP acceptance pending

**Verification note (2026-08-09):** paid/eligible/packed readiness, minimum
courier projection, manual provider boundary, assignment/reassignment, proof-
required delivery, structured failure/recovery, neutral communication intents,
and terminal state rules are source-complete. Delivery transitions lock the
exact Tenant/Store assignment row before replay and transition checks. The
Neon matrix now proves paid preparation, courier assignment, collected,
in-transit and delivered transitions, proof, audit events, duplicate completion,
terminal queue removal, reporting and usage for web, staff-assisted and
WhatsApp origins. A focused rerun rejects an actor without a Store role; domain
and repository tests cover invalid terminal transitions, failure recovery,
cancellation and active-queue filtering. Live courier/SOP acceptance remains a
separate production gate.

- [x] Only paid, delivery-eligible, packed, and ready orders can enter delivery assignment.
- [x] The assignment view exposes only the minimum courier information required to complete delivery and maintains tenant/store scoping.
- [x] Authorized staff can assign/reassign a courier and record assigned, collected, in-transit, delivered, failed, and rescheduled transitions.
- [x] Pharmacy-to-courier handoff and customer delivery proof are explicit, timestamped, auditable, and protected against duplicate completion.
- [x] Customer notifications remain neutral and provide secure status actions instead of including prescription contents.
- [x] Failed contact, unsafe delivery, wrong address, customer refusal, damaged package, return-to-pharmacy, refund, and escalation paths are supported.
- [x] A provider-neutral delivery boundary allows manual operation initially and future courier integration without changing the domain lifecycle.
- [x] Permission, transition, duplicate-event, failure-recovery, privacy, and end-to-end delivery tests are included.
