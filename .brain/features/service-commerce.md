# Service Commerce

## Status

The original product direction was approved on 2026-08-09 through ADR-0029.
ADR-0030 now amends it with Progressive Catalog and a thinner Pharmacy
extension. The owner approved the revised dependency-ordered 15-ticket batch
on 2026-08-09. Tickets 01 and 02 are complete; Ticket 03 is the next dependency
frontier. Production schema/provider operations remain separately authorized.

Pharmacy Commerce is the first regulated vertical and retains its completed
implementation evidence and outstanding production gates. The approved second
validation vertical is an appointment-based business such as a salon or
consultation practice.

## Sources Of Truth

- Decision: `.brain/decisions/ADR-0029-service-commerce-platform-core-and-vertical-capability-extensions.md`
- Progressive Catalog/Pharmacy amendment:
  `.brain/decisions/ADR-0030-progressive-catalog-and-thin-pharmacy-extension.md`
- Specification: `.scratch/service-commerce/spec.md`
- Approved tickets and execution order: `.scratch/service-commerce/issues/README.md`
- Midday migration contract: `.scratch/service-commerce/midday-migration-contract.md`
- Existing Service foundation: `.brain/features/generic-service-operations.md`
- First vertical: `.brain/features/prescription-commerce.md`
- Midday migration standard: `.scratch/prescription-commerce/midday-migration-contract.md`

## Product Boundary

Service Commerce lets a business receive customer intent through web, staff or
WhatsApp, decide what it can offer, and move the customer through the allowed
combination of Quote, booking, payment, pickup, delivery and service completion.
It is a capability platform, not a marketplace, chatbot builder, universal
request table or arbitrary workflow engine.

The customer-facing product may present this umbrella as **Assisted Commerce**
or **Requests & Quotes**. The internal Service Commerce name remains during
expand-contract migration so code and persistence are not renamed before the
revised switch gate.

The platform reuses existing bounded contexts rather than replacing them:

- Catalog: Products, Services, Variants, Offerings, prices and Store
  availability.
- Customer: Tenant-scoped customer identity and immutable Order snapshots.
- Customer Access: public request, Quote and tracking projections.
- Commerce: immutable Quote versions, Commercial Orders, payments and refunds.
- Service Operations: Intake, Jobs, work promises, assignments and handoff.
- Fulfilment: pickup and delivery eligibility, preparation, assignment and
  completion.
- Communications: WhatsApp/web/staff channel facts, templates, attempts,
  receipts and provider adapters.
- Reporting: channel, conversion, fulfilment, reliability, usage and cost
  projections from authoritative lifecycle events.

`ServiceRequest` and `PrescriptionRequest` remain separate source aggregates.
Ticket 01 now exposes the exact typed source reference and minimal shared
channel/capability/readiness/action/fulfilment vocabulary through
`@ewatrade/service-commerce`; it does not merge their lifecycles or database
models. Split compatibility acceptance protects both paths before ownership
moves.

Exact Product selections continue through the current cart/Commercial Order
path. ADR-0030 approves `commerce_inquiry` as a narrow Commerce-owned source
for Product demand that genuinely needs identification, availability
confirmation or a Quote. It is not a universal request and is never relabelled
as a Service or Prescription Request.

## Progressive Catalog Adoption

A Store may operate in a progressive Catalog mode before adopting complete
managed inventory:

1. An operator resolves each verified request line against an existing
   Offering or creates a private `DRAFT` Item/Variant/Offering.
2. Matching uses Tenant/Store-scoped verified aliases and source links. Raw
   customer text, OCR and provider payloads never create public Catalog data.
3. Price suggestions show attributable current Offering price, recent accepted
   Quote or completed sale, Store-first and Tenant-wide only when authorized.
   Each suggestion includes source, currency and effective time.
4. The operator may enter a different Quote price. It changes only the
   immutable Quote version unless a separate confirmed command updates the
   reusable Catalog price and records a `CatalogPriceChange`.
5. A Quote, request or sale never invents stock. Exact inventory reservations
   require configured balance sources and sufficient quantity. A progressive
   Product can instead use an explicit expiring manual/procure-to-order
   availability commitment when Store and vertical policy permit it.
6. Graduation enriches the same Catalog records with missing classification,
   units, variants, SKUs/barcodes, Store availability and verified opening
   stock. Quote, Order, price and source history remains linked.

Draft, active, publicly visible and exact-inventory-ready are separate states.
No request automatically publishes a Product, Service or medicine.

## Store Capability Profile

Each Store exposes a server-owned readiness projection for the capabilities it
has configured and is allowed to use:

- product and service discovery;
- direct intake or quote-required requests;
- bookings and resource availability;
- provider-hosted or recorded payments;
- pickup and delivery;
- web, staff-assisted and WhatsApp channels; and
- vertical/jurisdiction eligibility.

Tenant membership alone never grants operational authority. API and repository
boundaries resolve Tenant, Store, role, feature state and exceptional access;
the client renders the returned capabilities and recovery states.

Ticket 02 implements this projection through a disabled-by-default
`ServiceCommerceStoreProfile`, append-only `ServiceCommerceStoreAuditEvent`,
and the protected `serviceCommerce` router. Owner/Admin may configure and
activate an authorized Store; Manager/Cashier/Operator may operate enabled
capabilities; ordinary Member/Support access remains read-only and cannot
mutate. No shared personal-exception model exists for this capability yet, so
the returned `exceptionalAccess` is explicitly false rather than inferred in
the client.

The `/settings/service-commerce` workspace uses server prefetch/hydration,
typed `storeId` URL scope, shared Zod/RHF configuration, explicit loading/error
and read-only states, confirmation before activation, and exact access-query
invalidation before success. Readiness distinguishes disabled, incomplete
setup, vertical-policy restriction, provider outage, tracked-inventory state,
private draft capture, public activation, and procure-to-order policy.
An enabled WhatsApp capability is `setup_required` when no Store binding
exists and `unavailable` when its binding or Tenant-owned Connection is not
active. A server-owned Store-profile restriction takes precedence and projects
the named capability as `restricted`; setup clients cannot write that policy
input. Suspended profiles are rendered distinctly and cannot be reactivated
or deactivated through the generic command. Activation and active-profile
updates re-evaluate the same scoped runtime facts transactionally and require
at least one available channel plus one available Quote/booking outcome.
Ticket 11 owns the authorized jurisdiction/evidence command that maintains
those inputs and the separately approved Nigerian Pharmacy WhatsApp decision.

## Customer Lifecycle

1. The customer enters through a Store link, QR code, staff-assisted flow or
   the Store's WhatsApp identity.
2. The channel resolves the Tenant, Store, capability profile and appropriate
   source aggregate before content is persisted.
3. The business clarifies intent and either accepts direct intake, issues a
   versioned Quote, or offers valid booking slots.
4. The server projects only the actions valid for the current version and
   policy: `Request quote`, `Book`, `Pay now`, `Pick up`, `Delivery`,
   `Talk to staff`, reschedule or cancel.
5. Quote acceptance, booking and payment are idempotent commands. Fulfilment
   fees, promises and eligibility are fixed before payment when they change the
   total.
6. Work, pickup or delivery progresses through explicit operational states and
   emits customer-safe notifications and reporting facts.
7. Stale, expired, ambiguous, unauthorized or cross-Tenant actions fail closed
   and offer a safe recovery path.

## WhatsApp Architecture And Onboarding

- The business owns its WABA and public number. EwaTrade may share one Meta
  application and webhook, not one permanent sender identity across unrelated
  businesses.
- A Tenant-owned WhatsApp Connection stores provider identifiers, encrypted or
  managed credential reference, billing owner, templates, lifecycle and Store
  bindings. Store channel configuration selects the connection and capability
  profile.
- Manual onboarding is suitable for an early design partner. Repeatable setup
  uses Embedded Signup, explicit authorized-number selection, a pending binding
  and an identifier-only readiness job. A replacement route becomes active
  only after credential, number, webhook, template, billing and neutral-send
  checks pass.
- Independent businesses use distinct senders. A group may use one central
  number across its Stores only when an opaque link or explicit customer choice
  resolves Store context. Any unknown, ambiguous or cross-Tenant route is
  rejected before customer content is persisted.
- Direct Meta Cloud API is the initial adapter, matching Midday's transport
  direction. Midday's single global sender is deliberately not copied. Twilio
  is optional future infrastructure behind Communications, not a prerequisite.
- State-aware quick actions carry opaque short-lived capabilities. They never
  include sensitive content or treat button navigation as payment, booking or
  fulfilment truth.

## Pharmacy Vertical

Pharmacy is a thin regulated extension of the single Service Commerce
workspace. It does not retain separate channel, Catalog-adoption, Quote,
payment, pickup, delivery or reporting implementations. It does retain:

- private prescription media and time-limited access;
- deterministic or approved media safety and OCR adapters;
- mandatory human line verification;
- licensed-pharmacist release and substitution controls;
- regulated-item, privacy, retention, audit and break-glass rules;
- inventory-backed payable mapping; and
- pharmacy-specific pickup preparation and delivery release policy.

A human-verified Prescription line may link or propose a private Catalog draft.
OCR alone cannot create or publish medicine. Any in-stock or procure-to-order
availability commitment remains pharmacist-released and policy-gated. The
separate `PrescriptionRequest` aggregate enforces those rules; it is not a
second commerce platform.

As checked against Meta's published policy on 2026-08-09, drugs and healthcare
commerce are regulated and Nigeria is not in the published over-the-counter
drug exception list. Pharmacy WhatsApp activation therefore remains a separate
fail-closed legal/provider decision. Web and staff workflows do not inherit
permission merely because a WhatsApp connection is technically ready.

## Second Vertical

An appointment-based business is the approved proving case because it adds one
genuinely new shared capability—booking—while exercising existing Service
Requests, Quotes, payments and notifications without prescription rules. The
acceptance must prove that the business can configure services and resources,
receive web/staff/WhatsApp demand, offer or confirm a slot, collect the allowed
payment, reschedule/cancel, remind the customer and complete the service.

## Cost And Billing Boundary

- Meta publishes per-delivered-message pricing by recipient market and message
  category. Service replies and utility replies may have different charging
  treatment from business-initiated templates, and rates may change.
- Each Connection records the business or EwaTrade billing owner. Meta usage,
  optional BSP/Twilio markup, number fees, payment-provider fees, delivery
  costs, tax and EwaTrade subscription/usage charges remain separate facts.
- No provider rate is hardcoded into a Product, Service, medicine or delivery
  price. Unknown costs remain unknown in reporting.
- Recommended commercial validation: branch subscription plus metered usage,
  with optional onboarding, premium support and delivery coordination. Pricing
  is a hypothesis until pharmacy and second-vertical evidence is collected.

## Midday Implementation Contract

- Applications authenticate, resolve context, prefetch and compose.
- Reusable capability and provider behavior belongs in focused packages.
- Shared Zod schemas define forms, API inputs, jobs and public capabilities.
- Dashboard workspaces use server prefetch/hydration, typed `nuqs` URL state,
  globally owned sheets, explicit loading/error/empty states and exact query
  invalidation before success.
- API procedures remain thin; repositories carry explicit Tenant/Store
  predicates; multi-write commands are bounded, atomic and idempotent.
- Durable jobs carry identifiers only, re-authorize at execution and own
  provider writes/reconciliation.
- Direct Meta webhook parsing and job delivery are references for transport,
  not permission to move domain routing or business policy into the adapter.

## Migration And Acceptance

The amended migration remains expand-contract and proceeds by ticket frontier:

1. Record current ownership and compatibility contracts.
2. Add capability/readiness, source interoperability and vertical-policy seams
   without changing existing pharmacy or generic service behavior.
3. Add narrow Commerce Inquiry plus Progressive Catalog capture, matching,
   price suggestions and explicit price promotion.
4. Generalize WhatsApp connection/binding and channel intake naming behind
   stable contracts.
5. Reuse Quote, payment, booking, pickup and delivery capabilities and prove
   graduation from progressive Catalog to managed inventory.
6. Adapt Pharmacy as a thin regulated extension and prove no regression.
7. Prove the appointment vertical without prescription dependencies.
8. Run cross-vertical browser, accessibility, isolation, performance, privacy,
   security and failure-recovery acceptance before duplicate orchestration is
   contracted.

All local database work uses the verified `.env.local` Neon development
database. Local Docker/PostgreSQL is prohibited. Production schema, provider or
business activation remains separately authorized.

## Execution Frontier

The owner requested the batch be amended and approved the exact revised
15-ticket breakdown on 2026-08-09. The revised batch adds Tickets 03A and 06A.
Tickets 01 and 02 are complete and execution proceeds to Ticket 03. Throughout
execution:

- no production Prisma operation without separate authorization;
- no renaming or contraction of Prescription Commerce before its approved
  switch/contraction gate;
- no live Meta/Twilio/provider mutation without separate authorization;
- no claim that Pharmacy WhatsApp is policy-approved; and
- no change to completed Prescription Commerce ticket status.
