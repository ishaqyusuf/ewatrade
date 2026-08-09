# ADR-0029: Service Commerce Platform Core And Vertical Capability Extensions

## Status

Accepted as the product and architecture direction on 2026-08-09. The owner
approved the source implementation ticket batch on the same date. Work may
proceed one dependency-frontier ticket at a time; production database/provider
operations remain separately authorized.

## Context

EwaTrade now has two substantial commerce paths around customer intent and
operational fulfilment:

- Generic Service Operations owns public Service Requests, versioned Commerce
  Quotes, Commercial Orders, work Jobs, handoff, payments and notifications.
- Prescription Commerce adds private media, OCR assistance, human verification,
  pharmacist release, pickup/delivery and tenant-owned WhatsApp connections.

Pharmacy is a valuable first test case, but customer conversations that become
quotes, bookings, payments, pickup, delivery or completed services are not
pharmacy-specific. Making every shared capability prescription-owned would
duplicate infrastructure and make future verticals depend on clinical concepts.
Conversely, replacing proven source aggregates with one universal request or
workflow model would erase important domain rules and create a platform
monolith before a second vertical has validated the abstraction.

Midday remains the structural reference: applications compose server-prefetched
workspaces, packages own reusable behavior, API procedures orchestrate typed
contracts, query modules own persistence, jobs own durable side effects, and
provider transports remain behind package boundaries.

## Decision

- `Service Commerce` is a horizontal capability platform. Pharmacy Commerce is
  its first regulated vertical, not the permanent platform boundary.
- Existing bounded contexts remain authoritative. Catalog owns Items,
  Variants, Offerings and Store availability; Customer owns tenant customer
  identity; Commerce owns immutable Quote versions, Orders, payments and
  refunds; Service Operations owns work; Communications owns channel and
  provider delivery facts; fulfilment owns pickup and delivery operations.
- Existing source aggregates remain distinct. `ServiceRequest` continues to
  represent generic service intent and `PrescriptionRequest` continues to
  represent regulated prescription intake. A typed interoperability contract
  may expose common source references, states and commands, but no universal
  `CustomerRequest` table or arbitrary workflow engine is introduced now.
- Exact in-stock Product demand continues through the existing Storefront/cart
  and Commercial Order path rather than creating artificial request work. If a
  Product needs merchant clarification or a Quote before Order creation, the
  compatibility slice must validate a narrow Commerce-owned inquiry source;
  it must not relabel the intent as a Service or Prescription Request.
- A Store-scoped capability profile declares which combinations of product
  requests, service requests, quotes, bookings, payments, pickup, delivery and
  communication channels the business may activate. The server returns
  readiness and allowed actions; clients do not derive policy or authorization.
- Customer entry channels are adapters, not workflow owners. Web, staff and
  WhatsApp intake converge on the relevant source aggregate and reuse the same
  Quote, Order, payment, booking and fulfilment commands when eligible.
- WhatsApp connections are business-neutral Tenant resources with explicit
  Store bindings. EwaTrade may operate one Meta application and webhook, while
  each unrelated business owns its WABA, number, sender identity and billing.
  Central multi-Store numbers require explicit bounded Store context and every
  ambiguous or cross-Tenant route fails closed.
- Direct Meta Cloud API remains the initial provider adapter, consistent with
  the Midday transport reference. Twilio is not required. A BSP or Twilio may
  be added later behind the provider-neutral Communications contract when its
  operational benefit justifies its additional cost.
- Customer actions are server-projected from current state, capability and
  policy. Examples include `Request quote`, `Book`, `Pay now`, `Pick up`,
  `Delivery` and `Talk to staff`. Opaque, expiring, idempotent capabilities
  target internal versions; a button click or navigation event never proves
  payment or completion.
- Booking becomes a deliberate Service Commerce capability with availability,
  resource, promise, reschedule, cancellation and reminder semantics. It does
  not get embedded in Prescription Commerce or reduced to a generic JSON
  workflow.
- Vertical policy extensions own exceptional requirements. Pharmacy keeps
  private prescription media, safety/OCR, attendant verification, pharmacist
  release, retention, break-glass and regulated-channel controls. Other
  verticals add their own eligibility without weakening the platform core.
- WhatsApp policy, local law and provider approval are launch gates by vertical
  and jurisdiction. As checked on 2026-08-09, Meta's published Business
  Messaging Policy restricts drugs and healthcare commerce and its published
  over-the-counter-drug country list does not include Nigeria. Pharmacy
  WhatsApp therefore stays fail closed pending written policy/legal clearance;
  this does not block non-regulated Service Commerce validation.
- Provider costs remain external commercial facts. Meta currently publishes
  delivered-message pricing by market and category; BSP markup, number costs,
  payment fees, delivery costs and EwaTrade fees are metered separately and are
  never hardcoded into Quote domain rules.
- Migration is expand-contract. First define compatibility contracts and
  preserve current Prescription and Generic Service behavior, then extract
  capabilities behind stable seams, adapt Pharmacy Commerce, prove a second
  appointment-based vertical, and contract only after cross-vertical evidence.
- Completed Prescription Commerce tickets remain immutable evidence. They are
  not renamed, reopened or represented as platform implementation.

## Consequences

- The product can serve pharmacies first and later support appointment,
  repair, professional-service and other request-led businesses without
  copying channel, Quote, payment and fulfilment infrastructure.
- Pharmacy safety remains explicit instead of becoming optional flags in a
  generic request table.
- Some current prescription-named implementation will temporarily coexist with
  platform contracts during migration. Compatibility tests and source
  ownership maps are required before renames or contraction.
- Each business needs its own WhatsApp onboarding/readiness lifecycle and bears
  its own Meta/BSP usage unless a future commercial plan explicitly subsidizes
  it. One EwaTrade webhook does not mean one shared customer-facing number.
- The second vertical is an architecture test. Appointment-based services must
  use the platform without importing prescription concepts before extraction
  is considered successful.
- Production pharmacy WhatsApp activation remains independently blocked even
  if the horizontal platform and a non-regulated vertical are ready.

## References

- `.brain/decisions/ADR-0012-generic-service-operations-bounded-contexts.md`
- `.brain/decisions/ADR-0014-service-commerce-payments-handoff-and-messaging.md`
- `.brain/decisions/ADR-0026-prescription-commerce-product-and-operating-boundary.md`
- `.brain/decisions/ADR-0027-tenant-owned-multi-pharmacy-whatsapp-connections.md`
- `.brain/features/service-commerce.md`
- `.scratch/service-commerce/spec.md`
- `.scratch/service-commerce/midday-migration-contract.md`
- [WhatsApp Business Messaging Policy](https://whatsappbusiness.com/policy/)
- [WhatsApp Business Platform Pricing](https://whatsappbusiness.com/products/platform-pricing/)
