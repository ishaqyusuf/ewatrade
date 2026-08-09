# Service Commerce Platform Specification

**Status:** approved for source implementation in dependency order

**Date:** 2026-08-09

**First vertical:** Pharmacy Commerce

**Second validation vertical:** Appointment-based service business

Implementation must conform to
`.scratch/service-commerce/midday-migration-contract.md`.

## Problem Statement

EwaTrade has implemented valuable request-to-commerce behavior in two places.
Generic Service Operations supports Service Requests, Quotes, Orders, work,
payments, handoff and notifications. Pharmacy Commerce supports regulated
intake, direct Meta WhatsApp, professional review, payable Quotes, pickup and
delivery. The pharmacy experience proves the demand, but several capabilities
are useful to other businesses: receive a customer request, clarify it, quote
or book it, take payment, arrange pickup or delivery, and keep the customer
updated.

Keeping those capabilities pharmacy-facing would force future businesses to
depend on prescription names and clinical states. Rebuilding them per vertical
would duplicate routing, Quote, payment, fulfilment and notification logic.
Replacing the existing models with one generic request/workflow engine now
would be equally risky: source intent, safety and operating authority differ by
vertical, and a second vertical has not yet proved the exact abstraction.

The product needs a horizontal Service Commerce layer that reuses current
bounded contexts, preserves Pharmacy Commerce as the first regulated vertical,
and proves reuse with one appointment-based business before contracting any
existing implementation.

## Solution

Introduce Service Commerce as a capability platform over existing Catalog,
Customer, Customer Access, Commerce, Service Operations, Fulfilment,
Communications and Reporting boundaries.

The platform will provide:

- a Store capability/readiness profile;
- typed interoperability across existing source aggregates;
- channel-neutral web, staff and WhatsApp intake contracts;
- reusable immutable Quotes, Orders, hosted/recorded payments and refunds;
- booking and appointment lifecycle support;
- reusable pickup and delivery fulfilment;
- server-projected customer actions and notifications;
- business-owned WhatsApp connections with explicit Store bindings; and
- vertical/jurisdiction policy that can add restrictions without contaminating
  the shared core.

`ServiceRequest` and `PrescriptionRequest` remain authoritative. The shared
layer references them through typed source kinds and opaque identifiers; it
does not create a universal request table. Pharmacy-specific media, OCR,
attendant/pharmacist review, privacy and retention remain in Pharmacy Commerce.

The owner approved the expand-contract source ticket batch on 2026-08-09.
Implementation proceeds one dependency-frontier ticket at a time. Production
schema changes, provider mutations and rollout remain separately authorized.

## User Stories

### Business Setup And Capabilities

1. As a business owner, I can see which Service Commerce capabilities are
   available, configured, restricted or blocked for each Store so that I know
   what customers can actually use.
2. As a business owner, I can enable only the capabilities relevant to my
   operation—requests, quotes, bookings, payments, pickup, delivery, web, staff
   or WhatsApp—without enabling an unrelated vertical workflow.
3. As a business owner, I receive precise setup guidance for every unmet
   dependency, including Catalog, payment, fulfilment, WhatsApp and vertical
   policy requirements.
4. As a Store operator, I cannot activate a capability through client state or
   Tenant membership alone; the server evaluates Store readiness, role and
   policy.
5. As a group owner, I can configure capabilities per branch while retaining a
   Tenant-level view of connection, billing and reporting ownership.
6. As an auditor, I can determine who changed a capability, the prior/current
   value, reason, Store and time.

### Customer Intent And Source Ownership

7. As a customer, I can submit a product or service request without needing to
   understand the business's internal workflow.
8. As an operator, I can distinguish a generic Service Request from a
   Prescription Request and apply the correct permissions and policy.
9. As a developer, I can address supported source aggregates through one typed
   source-reference contract without importing one vertical's database model
   into another.
10. As a customer, a request never creates payable work or an Order unless the
    applicable direct-intake or Quote/booking command confirms it.
11. As an operator, I can clarify, decline, quote, book or route a request only
    when the source aggregate exposes that command in its current state.
12. As an auditor, I can trace a channel event to its source request, Quote,
    booking, Order and fulfilment without storing sensitive content in URLs,
    logs or provider identifiers.
12a. As a product customer selecting an exact available Offering, I can proceed
    through the existing cart/Commercial Order path without an artificial
    request record.
12b. As a product customer whose demand needs clarification or a negotiated
    Quote, my intent uses a narrow Commerce-owned inquiry source if discovery
    proves one is required; it is not mislabeled as a Service Request.

### Channel-Neutral Intake

13. As a customer, I can start from a public web link or WhatsApp and reach the
    same business outcome for capabilities supported by that channel.
14. As a staff member, I can record an assisted request on behalf of a customer
    with explicit actor and origin attribution.
15. As an operator, web, staff and WhatsApp requests enter the same source
    lifecycle rather than creating channel-specific business truth.
16. As a customer, duplicate submission or webhook replay returns the existing
    result and does not duplicate Requests, Quotes, bookings or Orders.
17. As a business, an unknown, ambiguous, inactive or cross-Tenant channel route
    fails before customer content is persisted.
18. As a customer, I receive a safe recovery route when my action expires or
    the business changes the current Quote, slot or fulfilment choice.

### WhatsApp Business Onboarding And Routing

19. As a business owner, I connect my own WABA and public number so customers
    see my business identity rather than a number shared by unrelated tenants.
20. As an early design partner, I can be onboarded through a controlled manual
    flow; as the product scales, I can use Meta Embedded Signup.
21. As an administrator, I explicitly select an authorized WABA number and
    consented test recipient; the system never guesses the first discovered
    number.
22. As an administrator, a new or replacement connection stays pending until
    credential, number, webhook, template, billing and neutral-send readiness
    passes.
23. As an existing business, failed setup or rotation leaves my working sender
    active and records a retryable failure.
24. As an independent business, my credentials, sender, templates, billing,
    messages and customers remain isolated from every other Tenant.
25. As a multi-branch business, I may bind one central number to several Stores
    only when an opaque Store link or explicit customer choice resolves the
    branch.
26. As a customer, the same WhatsApp identity contacting two businesses creates
    two isolated conversations and never becomes a global customer merge key.
27. As a platform operator, one verified EwaTrade Meta application and webhook
    may serve many Tenant-owned connections without sharing the public sender.
28. As a platform owner, I can later add an approved BSP or Twilio adapter
    without moving routing, Request, Quote, booking or fulfilment rules into
    provider code.

### Quote, Order And Payment

29. As an operator, I can issue a versioned Quote from an eligible Request with
    immutable customer-visible lines, prices, promise, expiry and fulfilment.
30. As a customer, I can accept only the current Quote version and receive the
    same Order when identical acceptance commands race or replay.
31. As a customer, a changed price, item, slot, address, delivery fee or promise
    supersedes the old capability and requires review of the new total.
32. As a business, Order creation, inventory reservation and downstream work
    happen atomically and exactly once.
33. As a customer, `Pay now` opens a scoped EwaTrade/provider-hosted checkout;
    opening a link or tapping a button never marks payment successful.
34. As a business, only verified provider callbacks or authorized recorded
    payments update the append-only payment ledger.
35. As a customer, duplicate, late, mismatched or failed payment events are
    idempotent or fail safely without changing the wrong Order.
36. As an operator, refunds are explicit, idempotent, Tenant/Store-scoped and
    reconciled from provider facts.

### Booking And Appointment Lifecycle

37. As an appointment business owner, I can configure bookable Offerings,
    resources, availability, duration, lead time, cancellation and payment
    policy per Store.
38. As a customer, I can view only currently eligible slots in the Store's
    timezone and book through an opaque scoped capability.
39. As a customer, two concurrent attempts cannot reserve the same exclusive
    resource/slot; one succeeds and the other receives an explicit recovery.
40. As an operator, I can create or confirm a booking from a Request or accepted
    Quote without inventing a prescription or Commercial Order state.
41. As a customer, I can pay a required deposit or full amount according to the
    snapshotted booking policy.
42. As a customer or authorized operator, I can reschedule or cancel within
    policy, with reason, revision guard, audit event and any refund consequence.
43. As an operator, a booking's scheduled, confirmed, arrived, in-service,
    completed, cancelled and no-show states remain distinct from payment state.
44. As a customer, I receive confirmation, reminder and change notifications
    through an allowed channel, with template/service-window rules enforced.
45. As a business, appointment completion can create or complete the relevant
    Service Job/Order relationship without bypassing work or balance rules.

### Pickup And Delivery

46. As a business owner, I can enable pickup, fixed-zone delivery, manual-fee
    delivery or neither for each Store.
47. As a customer, I select fulfilment before payment whenever it changes
    eligibility, fee, promise or exact total.
48. As a customer, `Pick up` and `Delivery` appear only when the current source,
    Quote, Store and vertical policy permit them.
49. As an operator, preparation and assignment reject unpaid, ineligible,
    unpacked/unready or unauthorized Orders.
50. As a pickup operator, I can mark ready and complete a secure handoff once;
    duplicate commands resolve idempotently.
51. As a delivery operator, I can prepare, assign, collect, progress, fail,
    reschedule, reassign, deliver or cancel using explicit reason/proof rules.
52. As a customer, sensitive address and operational details are encrypted or
    redacted and never exposed in ordinary public responses or notifications.
53. As a vertical owner, I can add release checks—such as pharmacist release—
    without making them mandatory for unrelated businesses.

### State-Aware Actions And Communications

54. As a customer, I see only actions valid now, such as `Request quote`,
    `Book`, `Pay now`, `Pick up`, `Delivery` or `Talk to staff`.
55. As a customer, every action is clear about the next consequence, current
    total, fulfilment choice or appointment time before confirmation.
56. As a developer, button payloads contain opaque capabilities rather than
    Tenant ids, Request ids, customer data or provider operation ids.
57. As a business, a button capability is short-lived, single-purpose,
    current-version checked and idempotent at the command boundary.
58. As a customer, an expired or stale action gives me an updated safe view or
    a human escalation path instead of silently doing nothing.
59. As an operator, notifications are provider-neutral intents; templates,
    service windows, delivery attempts and receipts are Communications facts.
60. As a customer, opt-in, opt-out and human escalation are available according
    to channel policy and applicable law.

### Pharmacy Vertical

61. As a pharmacy customer, I can submit permitted prescription material only
    through a channel approved for the Store, jurisdiction and use case.
62. As an attendant, I must compare safety-cleared original media with OCR and
    verify every line before professional review.
63. As a pharmacist, I remain the only professional release authority and can
    clarify, decline, map availability or release a revisioned decision.
64. As a pharmacy, payable lines require active Store Product Offerings and
    sufficient current inventory, with version/revision facts captured.
65. As a privacy lead, prescription media, transcripts, addresses, access,
    retention, incidents and break-glass remain under pharmacy-specific rules.
66. As a platform operator, generic capability extraction cannot weaken a
    completed pharmacy authorization, privacy, idempotency or audit invariant.
67. As a business owner, technical WhatsApp readiness does not activate a
    pharmacy channel when Meta policy, law, licence or operating approval is
    missing.

### Reporting, Cost And Operations

68. As a business owner, I can report requests, channel mix, Quote conversion,
    bookings, payment, pickup, delivery, completion and reliability per Store or
    Tenant from authoritative occurrence timestamps.
69. As a platform owner, I can meter Meta delivered messages by connection,
    market/category and billing owner without treating volatile rates as domain
    constants.
70. As a finance operator, Meta, BSP/Twilio, number, payment, delivery, tax and
    EwaTrade charges remain separately attributable and unknown costs do not
    render as zero.
71. As a support operator, I can see redacted routing/readiness/provider errors
    without accessing private request content.
72. As an auditor, all sensitive reads and material lifecycle commands have
    explicit actor, purpose, Tenant, Store, source, time and result.

### Migration And Compatibility

73. As an existing pharmacy, the migration preserves every implemented web,
    staff, WhatsApp, Quote, payment, pickup, delivery, privacy and reporting
    behavior until replacement acceptance proves parity.
74. As an existing service business, current Service Request, Quote, Order,
    work, handoff and notification behavior remains compatible.
75. As a developer, ownership is moved behind stable package exports before
    callers are renamed or old paths are contracted.
76. As a release owner, schema changes use expand, backfill/reconcile, switch
    and contract phases with rollback and explicit production authorization.
77. As a contributor, development database acceptance runs only against the
    verified `.env.local` Neon profile and never local Docker/PostgreSQL.
78. As the product owner, my 2026-08-09 approval authorizes source work only in
    dependency order; production database/provider operations remain separate.

## Implementation Decisions

### Domain And Package Boundaries

- Apps compose surfaces; packages own reusable contracts and behavior.
- Preserve Catalog, Customer, Commerce, Service Operations, Fulfilment,
  Communications and Reporting as bounded contexts.
- Introduce shared Service Commerce contracts only for proven interoperability:
  source kind/reference, capability/readiness, allowed actions, channel origin,
  fulfilment option and public projection.
- Keep source-specific commands behind adapters. Do not switch on vertical
  names throughout UI/API code; use an exhaustive registry at the boundary.
- Do not add a universal request table or generic state-machine JSON.
- Booking receives explicit typed models and commands because capacity and time
  conflicts are domain facts, not presentation metadata.

### Midday Architecture

- Server route: authenticate, resolve Tenant/Store, load typed URL state,
  prefetch bounded access/readiness and hydrate the client workspace.
- Dashboard: focused header, queue/table, global sheet controller, form context,
  explicit loading/error/empty/forbidden states and exact invalidation before
  success.
- URL state: shared `nuqs` parsers/hooks/loaders for safe filters, selection and
  explicit sheet modes; sensitive content never enters the URL.
- API: shared Zod contracts and thin tRPC orchestration with capability and
  role checks before repository calls.
- Repository: explicit Tenant/Store predicates, narrow projections and bounded
  atomic/idempotent multi-write commands.
- Jobs: identifier-only durable payloads, execution-time authorization,
  provider writes/reconciliation and safe retry semantics.
- WhatsApp: follow Midday's direct Meta transport/webhook/job separation, but
  replace its global sender assumption with Tenant Connection + Store Binding.

### WhatsApp Setup And Costs

- One EwaTrade Meta app/webhook can receive events for many business-owned
  Connections; every `phone_number_id` is resolved before customer content.
- Connection lifecycle is pending, active, suspended/revoked/replaced, with
  two-phase credential/route rotation.
- Direct Meta is the default adapter. Twilio/BSP adoption requires a separate
  cost/support decision but not a domain migration.
- Pricing is read from current provider facts or configuration. Meta currently
  charges delivered messages by market/category and may provide free service or
  user-triggered utility conditions; no numeric rate is frozen in code/spec.
- Meta policy and pricing references are reviewed at release, because both can
  change: https://whatsappbusiness.com/policy/ and
  https://whatsappbusiness.com/products/platform-pricing/.

### Migration Sequence

1. Inventory current ownership and lock compatibility evidence.
2. Add Store capability/readiness and source interoperability contracts.
3. Generalize WhatsApp Connection/Binding naming and channel routing behind
   stable exports.
4. Converge channel-neutral intake and shared Quote/payment/Order seams.
5. Add booking, then extract reusable pickup/delivery and actions.
6. Adapt Pharmacy Commerce without changing its vertical rules.
7. Prove the appointment vertical.
8. Run cross-vertical acceptance and only then consider contraction.

## Testing Decisions

### Primary Acceptance Seam

The primary deterministic seam is:

`connected business -> channel request -> source aggregate -> quote or booking -> payment -> pickup, delivery or service completion`

Run it for web, staff-assisted and WhatsApp origins using fake provider
adapters and the verified `.env.local` Neon development database. It must prove
fresh concurrent/idempotent commands, stale capability rejection, exact totals,
explicit Tenant/Store scope, customer-safe projections and run-owned atomic
fixture cleanup.

### Required Coverage

- Compatibility tests protect existing Generic Service and Pharmacy Commerce
  paths before extraction and after each seam moves.
- Unit tests cover exhaustive capability/action registries, vertical policy,
  booking availability/conflicts, fulfilment eligibility and cost attribution.
- Repository tests cover cross-Tenant/Store rejection, atomic write graphs,
  replay/concurrency, event timestamps and private/public projections.
- API tests cover role/readiness gates, typed validation, forbidden/missing
  context, loading/error/retry contracts and exact invalidation targets.
- Communications/jobs tests cover signature failure, unknown recipient,
  duplicate event, ambiguous central routing, rotation/revocation, template
  window, provider outage and retryable receipts.
- Browser QA covers authenticated desktop and mobile dashboard setup,
  queues/sheets/forms, public web journeys, WhatsApp deep links/actions,
  accessibility, keyboard/scroll, stale/error recovery and permissions.
- Cross-vertical acceptance proves that the appointment business imports no
  prescription package or state while Pharmacy Commerce keeps all safety gates.
- Performance/security/privacy tests cover connection routing, queue paging,
  booking contention, idempotency, rate limiting, secret handling, logs,
  capabilities and sensitive media/address access.
- Live Meta, payment, OCR/media or courier canaries remain distinct production
  gates and are never inferred from deterministic fake-provider tests.

## Out Of Scope

- Implementing a ticket before its blockers complete or beyond the approved
  source scope.
- A universal `CustomerRequest` database aggregate.
- An arbitrary no-code workflow builder or customer-programmable state machine.
- A marketplace that owns the merchant/customer relationship.
- One shared EwaTrade WhatsApp sender for unrelated businesses.
- Requiring Twilio or any BSP for the initial provider architecture.
- Automatic AI commitment, diagnosis, pricing, booking, substitution or
  professional approval without the owning domain's rules.
- Reopening or rewriting completed Prescription Commerce ticket history.
- Production schema migration, backfill, contraction or provider activation.
- Claiming pharmacy WhatsApp policy/legal approval from technical readiness.
- Hardcoding current Meta, BSP, payment or courier prices into domain logic.

## Further Notes

- Strategic recommendation: proceed with the global platform direction, but do
  it by extraction and proof, not a rewrite. Pharmacy remains the commercial
  wedge and safety benchmark; the appointment vertical validates generality.
- This planning batch deliberately separates business-neutral capabilities
  from vertical policy. That gives future businesses reuse without making
  pharmacy rules optional or invisible.
- The integration acceptance file and run-owned teardown are already large.
  The fulfilment extraction ticket must split fixture helpers and lifecycle
  specs while preserving one bounded atomic cleanup boundary.
- The batch was owner-approved on 2026-08-09. Ticket 01 is `ready-for-agent`;
  later tickets remain `approved; blocked` until their dependencies complete.
