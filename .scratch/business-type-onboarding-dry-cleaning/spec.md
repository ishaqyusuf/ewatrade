# Spec: Business Type Onboarding, Dry Cleaning Template, and Unsupported Business Ranking

Status: ready-for-agent
Source issue: https://github.com/ishaqyusuf/ewatrade/issues/28

## Problem Statement

Ewatrade currently treats Product Sales/Retail Ops as the first focused operating flow for small businesses that sell physical inventory. That is the correct first wedge, but the product opportunity is broader: many small businesses need the same operational discipline around customers, staff, orders, payments, and communication even when they do not sell stock in the same way.

Dry cleaning and laundry businesses are a clear first service-business candidate. They need to price clothing/service items, receive customer packages, prevent mix-ups, attach visual evidence, schedule pickup or delivery, notify customers when work is ready or delayed, and track whether payment was collected before or after delivery. At the same time, unsupported business types should not disappear into a vague "Other" bucket. Ewatrade needs to capture that demand and rank which business template to design next.

## Solution

Add a v1 business-type onboarding system with three supported outcomes:

- Product Sales: the existing first-class Retail Ops flow for businesses that sell inventory such as feeds, perfumes, watches, shoes, groceries, fashion, electronics, cosmetics, building materials, and general retail.
- Dry Cleaning/Laundry: the first service-business template, tailored around service items, customer packages, evidence capture, due dates, ready/delay notifications, pickup/delivery, and payment timing.
- Other: a generic fallback that lets unsupported businesses start with a safe default setup while capturing enough demand signals for Ewatrade's internal dashboard to rank which template should be designed next.

The onboarding choice should guide setup, labels, defaults, workflows, and copy without permanently trapping the business. Existing Product Sales tenants should remain stable and should be backfilled into the Product Sales template. Dry Cleaning should reuse platform primitives where they fit, especially tenant/store ownership, staff, customers, receipts/payments, notifications, share links, and reporting, while avoiding inventory-specific behavior such as stock deduction for service items. Other should store raw and normalized business information for product intelligence and future template planning.

## User Stories

1. As a new business owner, I want to choose the kind of business I run during setup, so that Ewatrade can start me in the right workflow.
2. As a new Product Sales owner, I want to choose that I sell products, so that I get the existing inventory, sales, customers, staff, and reporting flow.
3. As a Product Sales owner, I want to enter what I sell, so that Ewatrade can store my niche without hard-coding my business to feed, grain, or any single example.
4. As a Product Sales owner, I want examples like feeds, perfumes, watches, shoes, groceries, fashion, electronics, and general retail, so that I understand where my business fits.
5. As an existing Product Sales tenant, I want my current workflow to keep working after business templates are introduced, so that nothing breaks for my inventory and sales operation.
6. As an existing Product Sales tenant, I want Ewatrade to backfill my business template safely, so that I do not need to repeat setup.
7. As a dry cleaning owner, I want to choose Dry Cleaning/Laundry during setup, so that the app uses language and workflows that match my business.
8. As a dry cleaning owner, I want the app to call my priced entries service items or laundry items instead of products, so that staff understand what they are selecting.
9. As a dry cleaning owner, I want to create service items such as complete kaftan, shirt and trouser, jalabiya, iro and buba, and other garments, so that staff can price orders consistently.
10. As a dry cleaning owner, I want service items to support prices and variants such as small, regular, child, adult, or custom labels, so that different garment types can be priced properly.
11. As a dry cleaning owner, I want to deactivate old service items without deleting history, so that reports and old orders remain accurate.
12. As a dry cleaning owner, I want dry-cleaning service items not to behave like stock inventory, so that orders do not deduct nonexistent stock balances.
13. As a dry cleaning staff member, I want to create a new service order from the app, so that I can receive customer clothing quickly.
14. As a dry cleaning staff member, I want to search for an existing customer before creating a new one, so that repeat customers are not duplicated.
15. As a dry cleaning staff member, I want to create a new customer from the order flow, so that a walk-in customer can be served immediately.
16. As a dry cleaning staff member, I want to select service items and quantities, so that the total reflects the clothes the customer brought.
17. As a dry cleaning staff member, I want the order total to update from item prices and quantities, so that I can tell the customer the amount immediately.
18. As a dry cleaning staff member, I want to record whether the customer paid now or will pay later, so that payment follow-up is clear.
19. As a dry cleaning owner, I want payment status to distinguish unpaid, paid, and partially paid when needed, so that financial reports remain useful.
20. As a dry cleaning staff member, I want to set a ready date or delivery time, so that staff and customers know when the package should be ready.
21. As a dry cleaning staff member, I want to attach photos or a short video to the order, so that the package and customer bag can be identified later.
22. As a dry cleaning staff member, I want media evidence to be recommended but not always required, so that I can move quickly when the shop is busy.
23. As a dry cleaning staff member, I want to add notes about stains, missing buttons, special instructions, or bag details, so that work is handled correctly.
24. As a dry cleaning owner, I want service orders to move through clear statuses, so that I can see received, in progress, ready, delayed, picked up, delivered, completed, and cancelled work.
25. As a dry cleaning staff member, I want to mark an order as ready, so that the customer can be notified.
26. As a dry cleaning staff member, I want to mark an order as delayed and provide a reason or new ready time, so that the customer can be informed before they arrive.
27. As a dry cleaning customer, I want to receive a message when my package is ready, so that I know when to collect it or expect delivery.
28. As a dry cleaning customer, I want to receive a message if my package is delayed, so that I am not surprised.
29. As a dry cleaning owner, I want ready and delay messages to include the business name, order reference, total amount, and pickup or delivery information, so that customers get useful communication.
30. As a dry cleaning owner, I want WhatsApp and SMS to be supported as channel targets where configured, so that customer communication fits local behavior.
31. As a dry cleaning staff member, I want a manual copy/share fallback for customer messages, so that communication still works before every provider integration is live.
32. As a dry cleaning owner, I want to invite staff or attendants, so that multiple people can receive packages and update orders.
33. As a dry cleaning owner, I want staff access to be permissioned through the existing business membership model, so that attendants only access the business data they should.
34. As a dry cleaning owner, I want to share a service-request link, so that customers can request pickup or service without calling first.
35. As a dry cleaning customer, I want to open a service-request link and enter my name, contact, address or pickup details, preferred time, and notes, so that the business can arrange pickup.
36. As a dry cleaning owner, I want service requests to arrive as pending requests before becoming confirmed orders, so that staff can review availability and details.
37. As a dry cleaning staff member, I want to convert a service request into a confirmed service order, so that online requests and walk-in orders share the same operating flow.
38. As a dry cleaning customer, I want a simple way to see my service order status, so that I know whether it is received, ready, delayed, or completed.
39. As a platform customer, I eventually want one customer dashboard for orders across participating businesses, so that my sales orders and service orders are not scattered across separate apps.
40. As an unsupported business owner, I want to choose Other if my business is not Product Sales or Dry Cleaning, so that I can still start onboarding.
41. As an unsupported business owner, I want to describe what I do in my own words, so that Ewatrade understands my business instead of forcing a wrong category.
42. As an unsupported business owner, I want Ewatrade to ask a small number of useful questions about my business model, niche, items, staff, and order flow, so that setup does not feel like a long survey.
43. As an unsupported business owner, I want to land in a generic setup that is still usable, so that I can begin managing customers and basic operations while Ewatrade learns from my category.
44. As the Ewatrade team, I want every Other submission to be captured with raw text and normalized signals, so that we can understand demand instead of guessing.
45. As the Ewatrade team, I want an internal dashboard ranking unsupported business categories, so that we can decide which template to design next.
46. As the Ewatrade team, I want the ranking dashboard to show counts, recent signups, business sizes, countries, examples, and requested capabilities, so that prioritization is based on useful evidence.
47. As the Ewatrade team, I want to group similar Other entries such as barber shop, salon, and beauty service, so that demand is not split across many spellings.
48. As the Ewatrade team, I want to inspect sample raw submissions behind each ranked category, so that we do not lose the detail behind the summary.
49. As a product manager, I want Product Sales, Dry Cleaning, and Other to be represented as templates, so that future business types can be added deliberately.
50. As a developer, I want template-specific labels and behavior to come from system-owned configuration, so that merchants cannot accidentally break app language or flows with arbitrary copy.
51. As a developer, I want dry-cleaning orders to reuse shared customer, payment, staff, notification, and tenant boundaries, so that the service template fits the existing platform.
52. As a developer, I want service orders to avoid inventory stock deduction, stock wallets, and closeout assumptions unless explicitly added later, so that Product Sales logic remains correct.
53. As a support/admin user, I want to see which template a business is using, so that I can understand the merchant's experience when helping them.
54. As a business owner, I want the template choice to be changeable by an authorized owner/admin through settings, so that a mistaken setup can be corrected.
55. As a business owner, I want changing templates to be guarded and auditable, so that existing orders and reports are not silently reinterpreted.

## Implementation Decisions

- Add a system-owned business template concept with three v1 keys: Product Sales, Dry Cleaning/Laundry, and Other Generic.
- Product Sales remains the existing Retail Ops wedge. It continues to own inventory, product variants/units, stock custody, staff sessions, sales, closeout, reports, share links, and subscription packaging.
- Existing tenants/stores without an explicit template should resolve as Product Sales unless existing onboarding metadata proves otherwise.
- Store the selected business template at tenant/store setup time and include it in the completed onboarding session snapshot.
- Continue using the current onboarding bridge for store setup metadata, but add durable signal capture for unsupported Other businesses so ranking does not depend only on metadata blobs.
- The Product Sales onboarding path should ask for the business niche/main category after the owner chooses that they sell products.
- Product Sales niche examples should be broad and non-binding: feeds, perfumes, watches, shoes, groceries, fashion, electronics, cosmetics, building materials, spare parts, general retail, and Other.
- The Dry Cleaning/Laundry onboarding path should capture enough setup information to create an initial service workspace: business name, country/currency, service category, team size, optional support contact, and optional pickup/delivery preference.
- The Other onboarding path should capture raw description, operating model, what the business sells or provides, how orders are received, whether staff are involved, and any requested capability.
- Other should route the merchant into a generic fallback experience, but the captured signal should be available to Ewatrade admins for template prioritization.
- Build an internal unsupported-business ranking surface for Ewatrade operators, not a merchant-facing leaderboard.
- Ranking should use at least total submissions, recent submissions, activated tenants, country/currency distribution, business size, repeated phrases/categories, and requested capabilities.
- Similar Other entries should be grouped by normalized category while preserving raw submission text for review.
- A ranked unsupported category can later become a new template candidate, but designing those future templates is out of scope for this spec.
- Do not put tailoring, salons, repairs, restaurants, logistics, or other service categories into v1 as deep templates.
- Add a template terminology/configuration contract with system-owned labels and feature flags. V1 templates may tailor navigation labels, entity labels, empty-state copy, order terminology, dashboard headings, default statuses, notification copy, and visible workflow actions.
- Do not allow arbitrary merchant-defined app-wide terminology in v1. Customization should be selected from trusted template definitions and bounded merchant fields.
- Dry Cleaning/Laundry should introduce a service catalog concept rather than forcing service items through inventory stock behavior.
- Dry-cleaning service catalog entries should support name, description, category, active state, base price, optional variants/modifiers, currency, and audit timestamps.
- Dry-cleaning service item variants/modifiers should cover cases such as small, regular, child, adult, complex garment, or merchant-defined size labels where safe.
- Service item prices must be snapshotted onto order lines so old service orders are not recalculated when the price changes later.
- Dry-cleaning service orders should share platform ownership boundaries: tenant, store, customer, actor/staff member, payment records where relevant, and notification records where relevant.
- Dry-cleaning service orders should not deduct product inventory or staff stock wallet balances.
- The dry-cleaning order creation flow should be: create order, search or create customer, select service items, enter quantities, review total, set ready/delivery time, choose payment timing, optionally attach media, save order.
- Customer search should use the existing customer-book direction where possible and should support name, phone, and email identities.
- A dry-cleaning service order should support statuses for received, in progress, ready, delayed, pickup pending or delivery pending, completed, and cancelled.
- Payment state should at minimum support unpaid, paid, partially paid, and pay-on-collection or pay-on-delivery metadata.
- Media evidence should support photo and short video attachment metadata. The UI should recommend short video evidence for package and bag identification, but v1 should not block order creation when media is missing.
- Media evidence should be associated with the service order and should not be exposed publicly unless a future customer-facing policy explicitly allows it.
- Ready and delay notifications should be modeled as notification intents tied to service order events.
- WhatsApp and SMS should be supported as configured channel targets, but the v1 UX must include a manual copy/share fallback so the workflow works before every provider adapter is live.
- Ready messages should include the business name, order reference, total amount or amount due, and pickup/delivery instruction.
- Delay messages should include the business name, order reference, delay note, and revised ready/delivery expectation where known.
- Staff/attendants for Dry Cleaning should reuse the existing tenant membership/staff invitation direction and should not require a separate identity system.
- Dry Cleaning should have a public service-request link, similar in spirit to Product Sales share links but with service-request fields instead of product variant checkout.
- A public service request should collect customer identity/contact, pickup address or drop-off preference where applicable, requested pickup time, note, and optional item/package description.
- Public service requests should enter a pending state until staff confirms, rejects, or converts the request into a service order.
- Public service-request tracking should use an opaque token or authenticated customer identity. Do not expose raw database ids in public URLs.
- The customer-facing dashboard ambition should be preserved, but v1 can start with shared customer identity and accountless tracking links where needed.
- Product Sales share links and Dry Cleaning service-request links should remain distinct flows even if they share public link infrastructure.
- Reports for Dry Cleaning v1 should focus on operational service metrics: received orders, ready orders, delayed orders, completed orders, unpaid amount, paid amount, staff activity, and service item totals.
- Product Sales reports should not be renamed or reinterpreted by the Dry Cleaning template.
- Subscription and entitlement checks should continue to apply at the tenant/business boundary. Any new limits for service items, service orders, media, messages, or staff should be added deliberately rather than inferred from Product Sales product limits.
- Template changes by an owner/admin should be guarded. Existing Product Sales records should not become service orders, and existing service orders should not become stock sales.
- Admin/support views should expose the effective template key and raw onboarding answers for troubleshooting.
- The implementation should prefer existing service/repository/API layering: UI calls typed API routes, API routes call services, services call repositories/query modules, and tenant authorization remains explicit at boundaries.
- Prisma remains the schema source of truth. Runtime query helpers must not become a second schema authority.

## Testing Decisions

- Test at the highest useful seams: onboarding/template selection, dry-cleaning service order creation, public service-request conversion, unsupported-business ranking, and Product Sales compatibility.
- Tests should assert external behavior and persisted outcomes, not internal helper structure or UI implementation details.
- Onboarding tests should prove that Product Sales, Dry Cleaning/Laundry, and Other store the correct effective template and onboarding snapshot.
- Product Sales compatibility tests should prove existing product, inventory, staff, sale, customer, share-link, and reporting behavior still works for tenants backfilled to Product Sales.
- Dry-cleaning service catalog tests should prove service items can be created, priced, listed, deactivated, and snapshotted onto service order lines without inventory deduction.
- Dry-cleaning order tests should cover customer search/create, service item selection, quantity totals, payment timing, status transitions, due date handling, notes, and media attachment metadata.
- Notification tests should assert that ready and delay events create the expected notification intent/payload and that manual fallback copy can be generated without requiring a live SMS or WhatsApp provider.
- Public service-request tests should cover opaque link resolution, request submission, pending state, staff confirmation/conversion, and rejection/cancellation behavior.
- Unsupported-business ranking tests should cover raw capture, normalization/grouping, aggregation counts, recent-window ranking, and sample raw-entry retrieval.
- Authorization tests should prove tenant/store scoping across templates, service catalog entries, service orders, customers, staff, and ranking/admin surfaces.
- Prior art exists in the Retail Ops query and service tests around products, customers, sales, sessions, stock wallets, share links, fulfillment, sync, and subscriptions. New tests should follow that style where possible.
- UI tests, where added, should focus on user-observable flows: selecting a business type during setup, creating a dry-cleaning order, submitting a public service request, and viewing unsupported-business ranking results.
- Media tests should use attachment metadata and mocked storage/provider behavior rather than requiring real uploads in ordinary test runs.
- Messaging tests should use mocked delivery adapters and should not send real SMS, WhatsApp, or email.

## Out of Scope

- Building deep templates for tailoring, salons, barbing/salon businesses, repairs, restaurants, logistics, or other service categories in this v1 spec.
- Building a public template marketplace.
- Allowing merchants to define arbitrary app-wide terminology or rewrite system copy freely.
- Replacing Product Sales/Retail Ops with a generic abstraction before the dry-cleaning boundary is implemented.
- Reworking existing Product Sales inventory, stock wallets, closeout, or reporting behavior beyond safe template backfill and compatibility.
- Direct provider implementation for every WhatsApp/SMS vendor if the notification boundary can produce provider-ready intents and manual fallback copy first.
- Advanced customer dashboard features across every business type beyond the first shared identity/tracking boundary needed for Product Sales and Dry Cleaning.
- Advanced media processing, AI analysis of garment condition, or automatic dispute resolution from photos/videos.
- Online payment provider settlement for dry-cleaning service requests unless existing payment/receipt boundaries already support the chosen payment method.
- Multi-location dry-cleaning routing, driver assignment, or full logistics optimization.

## Further Notes

This spec synthesizes the conversation and the existing Retail Ops direction. The related Wayfinder planning map is https://github.com/ishaqyusuf/ewatrade/issues/16, but this spec is intended to be implementable without resolving every exploratory ticket first.

The core product principle is: Product Sales remains the first wedge; Dry Cleaning/Laundry becomes the first service template; Other captures real demand so Ewatrade can rank the next template from evidence instead of guessing.
