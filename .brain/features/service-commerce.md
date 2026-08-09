# Service Commerce

## Status

Product, architecture and the dependency-ordered source implementation batch
were approved on 2026-08-09 through ADR-0029 and the owner decision. Ticket 01
is the active `ready-for-agent` frontier; later tickets are approved but blocked.
Production schema/provider operations remain separately authorized.

Pharmacy Commerce is the first regulated vertical and retains its completed
implementation evidence and outstanding production gates. The approved second
validation vertical is an appointment-based business such as a salon or
consultation practice.

## Sources Of Truth

- Decision: `.brain/decisions/ADR-0029-service-commerce-platform-core-and-vertical-capability-extensions.md`
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
A typed interoperability contract will expose the minimum common source
reference, lifecycle and allowed-command vocabulary only after compatibility
tests protect both paths.

Exact Product selections continue through the current cart/Commercial Order
path. Product demand that genuinely needs merchant clarification or a Quote is
not forced into `ServiceRequest`; the first compatibility ticket must validate
whether a narrow Commerce inquiry source is required before adding it.

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

Pharmacy Commerce consumes shared Service Commerce capabilities but retains:

- private prescription media and time-limited access;
- deterministic or approved media safety and OCR adapters;
- mandatory human line verification;
- licensed-pharmacist release and substitution controls;
- regulated-item, privacy, retention, audit and break-glass rules;
- inventory-backed payable mapping; and
- pharmacy-specific pickup preparation and delivery release policy.

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

The approved migration is expand-contract and proceeds by ticket frontier:

1. Record current ownership and compatibility contracts.
2. Add capability/readiness and interoperability seams without changing
   existing pharmacy or generic service behavior.
3. Generalize WhatsApp connection/binding and channel intake naming behind
   stable contracts.
4. Reuse Quote, payment, booking, pickup and delivery capabilities.
5. Adapt Pharmacy Commerce and prove no regression.
6. Prove the appointment vertical without prescription dependencies.
7. Run cross-vertical browser, accessibility, isolation, performance, privacy,
   security and failure-recovery acceptance before any contraction.

All local database work uses the verified `.env.local` Neon development
database. Local Docker/PostgreSQL is prohibited. Production schema, provider or
business activation remains separately authorized.

## Execution Frontier

The owner approved the source ticket batch on 2026-08-09. Ticket 01 may start;
later tickets wait for their declared blockers. Throughout execution:

- no production Prisma operation without separate authorization;
- no renaming or contraction of Prescription Commerce before its approved
  switch/contraction gate;
- no live Meta/Twilio/provider mutation without separate authorization;
- no claim that Pharmacy WhatsApp is policy-approved; and
- no change to completed Prescription Commerce ticket status.
