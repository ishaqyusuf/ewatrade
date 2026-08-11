# 12 - Validate Second Vertical Appointment Business

**What to build:** Configure and exercise an appointment-based business such as a salon or consultation practice through the shared Service Commerce capabilities, proving reuse without importing prescription concepts.

**Blocked by:** 03A — Grow The Private Catalog From Requests And Quotes; 05 -
Deliver Channel-Neutral Request Intake; 06 - Reuse Quote Payment And Order
Conversion; 06A — Graduate Progressive Catalog To Managed Inventory; 06B -
Enforce Store Quotation Approval And Release; 07 - Add Booking And Appointment
Lifecycle; 09 - Deliver State-Aware Customer Actions And Notifications; 11 -
Enforce Vertical And Jurisdiction Eligibility.

**Status:** source-complete on 2026-08-11; Ticket 13 owns shared reporting,
provider-cost observability and final cross-vertical release acceptance

**Approval:** Original and revised Progressive Catalog validation scope
owner-approved on 2026-08-09; optional generic media boundary assertion
approved on 2026-08-10.

- [x] Create a run-owned Tenant/Store fixture with Service Offerings, resources, availability, payment policy and web/staff/WhatsApp capabilities.
- [x] Start with an incomplete Service Catalog, capture at least one requested
  Service as a private draft, use attributable price history, then graduate it
  without importing Product-stock or prescription concepts.
- [x] Complete web, staff-assisted and WhatsApp requests through slot selection/confirmation, exact deposit or payment, reminders and service completion.
- [x] Exercise reschedule, cancellation/refund, no availability, concurrent slot contention, stale action and provider notification failure.
- [x] Exercise one default attendant-released Quote and one approval-required
  Quote without importing Pharmacy roles, proving that Store commercial
  governance is vertical-neutral.
- [x] Prove one business-owned WhatsApp sender and Store binding without any pharmacy channel, model, role, media or release dependency.
- [x] Prove that a vertical which does not enable attachments imports no media
  or Pharmacy dependency, while the shared capability remains available for a
  future image/document-assisted request without changing booking rules.
- [x] Assert customer-safe public/WhatsApp projections and Tenant/Store isolation for the same customer across the appointment business and pharmacy.
- [x] Verify management queues plus the authoritative lifecycle, usage and audit facts that Ticket 13 will consume; defer shared report and provider-cost projection acceptance to Ticket 13.
- [x] Run authenticated desktop/mobile setup/workspace and public journey QA including keyboard, scroll, accessibility and error recovery.
- [x] Document which abstractions were genuinely reused and any vertical-specific rule that should remain outside the platform core.

## Completion Evidence

- The channel-neutral appointment fixture and composite acceptance import no
  Prescription module or Pharmacy fixture. The verified `.env.local` Neon run
  passed `1 test / 56 assertions` and removed its run-owned Tenant and Users.
- The separate cross-vertical same-phone isolation seam passed `1 test / 10
  assertions` and composed Appointment and Pharmacy only at the acceptance
  boundary. Both fixture cleanup paths completed with zero matching Tenants and
  Users remaining.
- The Appointment seam covers progressive private Service capture, attributable
  price evidence, Service graduation without Product stock, web/staff/WhatsApp
  intake, both Quote release modes, exact payment, slot contention, reminders,
  service completion, reschedule, cancel/refund, stale capabilities, provider
  failure, safe projections, management queues and authoritative event/audit
  facts. Attachments remain disabled and zero generic media rows are asserted;
  the shared attachment capability can be enabled later without changing the
  booking lifecycle.
- Focused dashboard/storefront state checks passed `8 tests / 24 assertions`;
  DB, dashboard and storefront TypeScript plus scoped Biome checks passed.
  Authenticated browser QA covered 1280x720 and 390x844 layouts, a native modal
  sheet, Tab/Shift+Tab containment, Escape close, inner scrolling, no horizontal
  overflow and no console errors. The public 390px journey demonstrated no
  preselected slot and explicit selection; dashboard retry and public
  unavailable states remained safe.
- Reused platform abstractions are Service Request, progressive Catalog,
  Commerce Quote/options/release, payment/Order, Customer Channels, policy,
  customer actions, booking resources/capabilities and durable notifications.
  Pharmacy clinical review, pharmacist release, OCR, retention, break-glass and
  regulated WhatsApp eligibility remain outside the shared core.
- No local Docker/PostgreSQL, production database operation or live-provider
  mutation was used. Ticket 13 remains responsible for shared report/provider-
  cost projections and the final cross-vertical release gates.
