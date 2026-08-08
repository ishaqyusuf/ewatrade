# 14 - Delivery Assignment And Execution

**What to build:** Add the operational delivery lifecycle for eligible, paid, prepared prescription orders, including courier assignment, pharmacy handoff, transit, delivery proof, failure, rescheduling, and customer-service recovery.

**Blocked by:** 11 - Hosted Payment, Receipts, Retries, And Refunds; 12 - Pickup Preparation And Handoff; 13 - Delivery Zones And Payable Delivery Quotes

**Status:** implemented-source; delivery SOP acceptance pending

- [ ] Only paid, delivery-eligible, packed, and ready orders can enter delivery assignment.
- [ ] The assignment view exposes only the minimum courier information required to complete delivery and maintains tenant/store scoping.
- [ ] Authorized staff can assign/reassign a courier and record assigned, collected, in-transit, delivered, failed, and rescheduled transitions.
- [ ] Pharmacy-to-courier handoff and customer delivery proof are explicit, timestamped, auditable, and protected against duplicate completion.
- [ ] Customer notifications remain neutral and provide secure status actions instead of including prescription contents.
- [ ] Failed contact, unsafe delivery, wrong address, customer refusal, damaged package, return-to-pharmacy, refund, and escalation paths are supported.
- [ ] A provider-neutral delivery boundary allows manual operation initially and future courier integration without changing the domain lifecycle.
- [ ] Permission, transition, duplicate-event, failure-recovery, privacy, and end-to-end delivery tests are included.
