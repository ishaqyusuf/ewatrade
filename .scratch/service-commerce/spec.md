# Service Commerce Platform Specification

**Status:** amended specification approved through 2026-08-10; source implementation authorized in dependency order

**Date:** 2026-08-09

**Last amended:** 2026-08-10

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
- generic private request media, typed attachments and human-verified
  observations; stable Store entry links/QR codes; and
- Store attendant routing plus optional exact-version quotation approval; and
- vertical/jurisdiction policy that can add restrictions without contaminating
  the shared core.

`ServiceRequest` and `PrescriptionRequest` remain authoritative. The shared
layer references them through typed source kinds and opaque identifiers; it
does not create a universal request table. Generic media transport, private
storage, safety/retry, delivery grants and baseline retention are shared.
Pharmacy-specific clinical media records, OCR, attendant/pharmacist review,
privacy and regulated retention remain in Pharmacy Commerce.

The owner approved the original expand-contract source ticket batch on
2026-08-09 and requested the Progressive Catalog/thin-Pharmacy amendment later
the same day. The owner approved the revised dependency graph on 2026-08-09,
and source implementation resumes from Ticket 01. Production schema changes,
provider mutations and rollout remain separately authorized.
On 2026-08-10 the owner approved ADR-0031's Customer Channels, stable entry
link/QR, generic request-media and selectable Offer Option amendment. The batch
was further amended by ADR-0032 with Store team routing and Quote release
approval and now contains 17 dependency-ordered tickets.

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
    Quote, my intent uses the approved narrow Commerce-owned `commerce_inquiry`
    source; it is not mislabeled as a Service Request.

### Progressive Catalog And Inventory Adoption

12c. As a business without a complete Catalog, I can resolve a verified request
    line to an existing Offering or create a private draft Product/Service
    Catalog graph without publishing it.
12d. As an attendant preparing a Quote, I can see price suggestions from the
    current Offering, recent accepted Quotes and completed sales, with Store,
    currency, source and effective time visible.
12e. As an attendant, I can enter a different current Quote price without
    silently changing the reusable Catalog price.
12f. As an authorized Catalog manager, I can explicitly promote a confirmed
    price into Catalog price history with actor, reason and source attribution.
12g. As a business, a request, Quote or sale never creates fictional stock. I
    must either use sufficient tracked stock or record an expiring manual/
    procure-to-order availability commitment allowed by Store and vertical
    policy.
12h. As a business adopting full inventory later, I can enrich the same draft
    records with classification, units, variants, SKUs/barcodes, Store
    availability and verified opening stock without losing request, Quote,
    Order or price history.
12i. As a customer, draft or progressively captured items remain private until
    an authorized publish/activation command explicitly makes them available.

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

### Customer Channels, Entry Points And Request Media

18a. As a business owner, I manage every business-owned connection under
    `Settings > Channels`, where I can see multiple Connections, lifecycle,
    billing owner and Store assignments without entering Prescription setup.
18b. As an administrator, I complete `setup -> configure -> test -> publish`
    for a connection while an existing working route remains active until its
    replacement passes readiness.
18c. As a Store owner, I publish a stable customer entry page, link and QR code
    that expose only currently allowed web and WhatsApp choices. Replacing a
    number or provider does not require reprinting the QR.
18d. As a customer, I can attach an image or approved document to an eligible
    Product, Service or Prescription request through web, staff-assisted or
    WhatsApp intake without entering the wrong vertical lifecycle.
18e. As an operator, I can view only safety-permitted attachments through a
    short-lived authorized grant and can recover explicitly from pending,
    rejected, provider-download, scanner, re-upload or expired-grant states.
18f. As an attendant, I can record a revisioned, attributable Human-Verified
    Observation such as `bag / red / small` from a safe attachment. Automated
    suggestions cannot become verified Catalog, price, stock or Order truth.
18g. As a privacy lead, generic media has Tenant/Store isolation, private
    storage, access audit and baseline retention/deletion while a regulated
    vertical may impose stricter interpretation, access and retention rules.
18h. As a Store owner, I assign accepted active team members as attendants who
    handle requests, regardless of whether they also hold a pharmacist or other
    vertical role.
18i. As a Store owner, quotation approval is explicitly off by default so an
    assigned attendant may release the correct Quote; when I enable it, I must
    select at least one active quotation approver.
18j. As an approver, I approve or reject the exact current Quote Version, not a
    mutable request or future revision. A creator cannot approve their own
    version when approval is required.

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
29a. As a customer, when a business offers red-small at NGN 20,000 and
    black-large at NGN 30,000 as alternatives, I choose one immutable Offer
    Option; the system never adds both choices into a NGN 50,000 payable total.
29b. As a business, an Offer Option selection is current-version and expiry
    checked, revalidates availability and yields one exact payable option.
    Unselected options cannot create an Order, reservation or payment.
29c. As an assigned attendant at a Store using the default release mode, I can
    prepare and send a Quote without waiting for a second person.
29d. As an assigned attendant at a Store requiring approval, I can prepare and
    submit a private Quote Version but cannot expose, send, accept or charge it
    until an active selected approver releases that exact version.
29e. As a quotation approver, my decision records the version, policy revision,
    actor, time and bounded reason; revising a pending Quote supersedes that
    pending decision, while approved/rejected history remains immutable and
    never authorizes the new version.
29f. As a pharmacist who is also assigned as an attendant or approver, my
    commercial capabilities compose with—but never replace—clinical review and
    professional release.
30. As a customer, I can accept only the current Quote version and receive the
    same Order when identical acceptance commands race or replay.
31. As a customer, a changed price, item, slot, address, delivery fee or promise
    supersedes the old capability and requires review of the new total.
32. As a business, Order creation, inventory reservation and downstream work
    happen atomically and exactly once when exact stock is configured; an
    allowed procure-to-order item instead creates one explicit procurement/
    fulfilment commitment and never a fabricated reservation.
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
    `Choose red small`, `Book`, `Pay now`, `Pick up`, `Delivery` or
    `Talk to staff`.
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
    either sufficient current inventory or an explicitly permitted,
    pharmacist-released procure-to-order availability attestation, with
    version/revision and expiry facts captured.
65. As a privacy lead, the shared Media Asset may carry private bytes and safe
    delivery mechanics, while the Prescription clinical record, OCR,
    transcripts, addresses, professional access, regulated retention,
    incidents and break-glass remain under pharmacy-specific rules.
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
78. As the product owner, I approved the Progressive Catalog amendment on
    2026-08-09 and the exact 17-ticket Customer Channels/media/Offer Options/
    Store team/Quote approval amendments on 2026-08-10; implementation follows
    their blockers and keeps production database/provider operations separately
    gated.

## Implementation Decisions

### Domain And Package Boundaries

- Apps compose surfaces; packages own reusable contracts and behavior.
- Preserve Catalog, Customer, Commerce, Service Operations, Fulfilment,
  Communications and Reporting as bounded contexts.
- Introduce shared Service Commerce contracts only for proven interoperability:
  source kind/reference, capability/readiness, allowed actions, channel origin,
  fulfilment option and public projection.
- The exact initial source registry is `service | prescription |
  commerce_inquiry`. Commerce Inquiry is Product clarification/Quote demand,
  not a universal request and not an alternative to exact cart/Order flow.
- Commerce Inquiry owns only pre-Order Product intent and its requested lines.
  Its exact lifecycle is `received | needs_clarification | ready_to_quote |
  quoted | converted | declined | withdrawn | expired`. Quote acceptance—not
  line resolution or Catalog creation—converts it to one Order.
- Keep source-specific commands behind adapters. Do not switch on vertical
  names throughout UI/API code; use an exhaustive registry at the boundary.
- Do not add a universal request table or generic state-machine JSON.
- Booking receives explicit typed models and commands because capacity and time
  conflicts are domain facts, not presentation metadata.

### Generic Media And Observation Boundary

- A private Media Asset owns bytes/metadata, channel origin, content digest,
  allowlisted type/size, safety/lifecycle state, retry, short-lived delivery,
  baseline retention and access audit. A typed Source Attachment links it to
  the current `service | prescription | commerce_inquiry` source/version.
- `attachments` is an explicit Store capability and is disabled by default.
  Category may recommend it; the server still requires current channel,
  source, provider and vertical-policy readiness before intake or viewing.
- A Human-Verified Observation is a revisioned, attributable interpretation of
  one safe attachment and optional source line. It can feed matching or draft
  preparation, but it is not Catalog, price, availability, stock, professional
  release or Order truth.
- Web, staff and WhatsApp adapters resolve Store/channel/policy before content
  persistence and hand only identifiers to durable retrieval/safety jobs.
  Provider bytes, credentials, signed URLs and customer content never enter job
  payloads, public projections, logs or URL state.
- Pharmacy retains a clinical extension over the generic asset: original-media
  comparison, OCR/transcription, human line verification, pharmacist release,
  professional access, regulated retention and break-glass. Existing
  `PrescriptionMedia` contracts stay compatible during expand-contract.
- Generic OCR/vision may suggest observations only under a separately approved
  provider contract; it cannot mark them human-verified or trigger Catalog or
  commercial commands.

### Progressive Catalog Boundary

- Reuse `DRAFT` Catalog Items, Variants and Offerings rather than adding a
  second candidate Catalog. Add typed source-origin and verified-alias records
  only where existing Catalog/Quote history cannot express the relationship.
- A draft Offering may be transacted only through the current authorized Quote
  capability that created/resolved it. It is not public or generally sellable.
- Suggestion precedence is current Offering price, recent accepted Store Quote,
  completed Store sale, then authorized Tenant history. Draft/rejected Quotes,
  other Tenants, mismatched currencies and expired availability cannot suggest
  a current price.
- Applying a suggestion or entering a price writes the immutable Quote version.
  Catalog price promotion is a separate confirmed command that records a
  `CatalogPriceChange`; it never rewrites historical Quote/Order snapshots. If
  the existing Offering price is Tenant-wide, confirmation names the impact on
  every bound Store; a Store-specific Quote is not silently promoted as a
  Store-specific reusable price that the Catalog does not support.
- Progressive Product availability is explicit: tracked in-stock, expiring
  manual/procure-to-order, or unavailable. Only tracked in-stock acceptance
  reserves a configured balance source. Tracked in-stock applies only to an
  active Offering with explicit unit, Store-availability and existing-balance
  configuration; a private draft uses manual/unavailable until Ticket 06A
  explicitly graduates it, and neither path publishes implicitly.
- Graduation performs verified Catalog enrichment and an explicit opening-stock
  operation. It never derives stock from Quote or sales counts.
- Service Offerings graduate through classification, duration/work/booking
  policy and price completion; they do not acquire stock semantics.
- Human confirmation owns matching. Automated similarity may rank candidates
  but cannot merge, publish, price, substitute or create medicine autonomously.

### Selectable Offer Options Boundary

- Every Commerce Quote version has one or more immutable Offer Options. A
  simple existing Quote maps to one default option; a multi-option Quote keeps
  each alternative's complete lines, currency, availability/fulfilment facts
  and exact total separate.
- A multi-option Quote is not payable until the customer explicitly selects one
  current option. Selection is idempotent, expected-version and expiry guarded,
  revalidates availability, and records one authoritative choice. Competing
  different selections produce typed stale/conflict recovery.
- Only the selected/default option can reach acceptance, Order conversion,
  inventory reservation/procurement and payment. Unselected options have no
  monetary, stock or fulfilment effect.
- The existing `alternative` Quote-line outcome is not an exclusive-choice
  model and must not add every displayed alternative into the payable total.

### Store Team And Quote Release Boundary

- Customer Channels composes Store team routing and Quote policy in onboarding,
  but neither is stored on a WhatsApp Connection. The same assignments and
  release policy govern web, staff, QR and WhatsApp origins.
- Team assignments reference active Tenant memberships and add Store-scoped
  `attendant` or `quote_approver` capabilities. Existing staff invitation owns
  identity creation. A vertical role such as pharmacist is independent and may
  coexist on the same person.
- Existing source-owned Service/Pharmacy actor authorization remains a narrow
  compatibility input until audited reconciliation creates explicit Store
  assignments. New Store publish requires an attendant; Tenant role alone does
  not infer one or broaden access.
- Release mode is exactly `attendant_can_release | approval_required` and is
  revisioned. The first is the explicit default. Existing Stores resolve to
  that typed compatibility default until an approved backfill persists it;
  absent or malformed client state never chooses authority.
- In default mode, one active assigned attendant may prepare and release the
  exact version atomically. In approval-required mode, preparation creates a
  private `DRAFT` version plus a `pending` approval record without a public
  acceptance capability or outbound notification; it leaves the source pre-
  Quote until an active selected approver other than its creator decides.
- Approval decision lifecycle is `pending | approved | rejected | superseded`.
  Approval atomically changes `DRAFT` to `ISSUED`; staff rejection does not use
  customer `DECLINED` and requires a new immutable version before resubmission.
  Revision supersedes only a still-pending decision and preserves historical
  approved/rejected facts.
- Release is the sole atomic owner of source quoted transition, issued audit/
  usage, public capability and notification eligibility. Exact replay cannot
  duplicate them, and rejection/revision emits no issued lifecycle fact.
- Approval/rejection is bound to Tenant, Store, source, Quote, Quote Version,
  policy revision and actor. Revision, revocation or supersession invalidates
  the pending decision. Approval revalidates current policy, professional
  release, Offer Options, totals, availability and expiry in the release
  transaction.
- Clinical/professional release, Quote approval, customer Offer Option
  selection and customer acceptance are distinct commands and audit facts.

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
- Media UI: adapt Midday Vault's upload progress, private preview, processing
  status, retry and empty/error patterns, while keeping EwaTrade's short-lived
  server grant, Tenant/Store policy and source-version requirements.

### WhatsApp Setup And Costs

- One EwaTrade Meta app/webhook can receive events for many business-owned
  Connections; every `phone_number_id` is resolved before customer content.
- Connection lifecycle is pending, active, suspended/revoked/replaced, with
  two-phase credential/route rotation.
- Dashboard connection ownership is `Settings > Channels` / `Customer
  channels`. It lists multiple Tenant Connections and Store bindings. Its
  publish step creates a stable Store entry page, share link and QR code; the
  QR never embeds a mutable provider number.
- The `configure` step includes Store `Team & routing` and `Quotation approval`.
  `Assign attendants` selects active team memberships; `Require approval before
  sending` is off by default and reveals the active approver selector when on.
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
2. Add Store capability/readiness, source interoperability and vertical policy.
3. Add Commerce Inquiry and Progressive Catalog capture/price suggestions.
4. Generalize WhatsApp Connection/Binding naming and channel routing behind
   stable exports, assign the Store attendants, then publish the stable Store
   entry link/QR from Customer Channels.
5. Add generic private request media, typed attachments and Human-Verified
   Observations, then let channel-neutral intake consume that entry point.
6. Extract shared Quote/payment/Order seams including exact selectable Offer
   Options, add optional exact-version quotation release approval, then prove
   progressive-to-managed-inventory graduation.
7. Add booking, then extract reusable pickup/delivery and actions.
8. Adapt Pharmacy as a thin regulated extension without weakening its source
   rules.
9. Prove the appointment vertical.
10. Run cross-vertical acceptance and only then consider contraction of
    duplicate orchestration.

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
- Progressive Catalog tests cover private draft creation, deterministic
  matching, Store-first price suggestions, explicit override/promotion,
  currency/Tenant isolation, stale availability, tracked versus procure-to-
  order acceptance and graduation without history loss.
- Generic media tests cover web/staff/WhatsApp image/document ingestion,
  provider replay/retry, safety failure, short-lived grant recovery, stale
  source/observation rejection, baseline retention and Tenant/Store isolation.
- A non-Pharmacy bag-seller acceptance path proves image -> Human-Verified
  Observation -> Catalog match/private draft -> two mutually exclusive priced
  Offer Options -> one selected exact Quote/Order/payment/fulfilment outcome.
- Quote release tests cover the explicit default attendant path and the
  approval-required path across web/staff/WhatsApp, including rejection,
  revision, creator self-approval denial, removed approver, concurrency/replay,
  policy revision and pharmacist-plus-attendant capability composition.
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
- A second candidate Catalog parallel to the existing draft Catalog graph.
- Automatic public Catalog publication, reusable price updates, stock creation,
  Product substitution or medicine mapping from raw customer/OCR text.
- Public object URLs, raw attachment/provider data in source JSON, or treating
  safety/OCR/vision output as a Human-Verified Observation.
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
- The original and Progressive Catalog batches were owner-approved on
  2026-08-09. The owner approved ADR-0031's Customer Channels, generic request
  media and Offer Options amendment plus ADR-0032's Store team/Quote release
  amendment on 2026-08-10, producing the current 17-ticket dependency graph.
