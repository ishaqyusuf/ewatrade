# 12 - Validate Second Vertical Appointment Business

**What to build:** Configure and exercise an appointment-based business such as a salon or consultation practice through the shared Service Commerce capabilities, proving reuse without importing prescription concepts.

**Blocked by:** 05 - Deliver Channel-Neutral Request Intake; 06 - Reuse Quote Payment And Order Conversion; 07 - Add Booking And Appointment Lifecycle; 09 - Deliver State-Aware Customer Actions And Notifications; 11 - Enforce Vertical And Jurisdiction Eligibility.

**Status:** approved; blocked

**Approval:** Owner-approved on 2026-08-09. Start only after every listed blocker is complete.

- [ ] Create a run-owned Tenant/Store fixture with Service Offerings, resources, availability, payment policy and web/staff/WhatsApp capabilities.
- [ ] Complete web, staff-assisted and WhatsApp requests through slot selection/confirmation, exact deposit or payment, reminders and service completion.
- [ ] Exercise reschedule, cancellation/refund, no availability, concurrent slot contention, stale action and provider notification failure.
- [ ] Prove one business-owned WhatsApp sender and Store binding without any pharmacy channel, model, role, media or release dependency.
- [ ] Assert customer-safe public/WhatsApp projections and Tenant/Store isolation for the same customer across the appointment business and pharmacy.
- [ ] Verify management queues plus the authoritative lifecycle, usage and audit facts that Ticket 13 will consume; defer shared report and provider-cost projection acceptance to Ticket 13.
- [ ] Run authenticated desktop/mobile setup/workspace and public journey QA including keyboard, scroll, accessibility and error recovery.
- [ ] Document which abstractions were genuinely reused and any vertical-specific rule that should remain outside the platform core.
