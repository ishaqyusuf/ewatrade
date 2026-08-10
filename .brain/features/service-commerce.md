# Service Commerce

## Status

The original product direction was approved on 2026-08-09 through ADR-0029.
ADR-0030 now amends it with Progressive Catalog and a thinner Pharmacy
extension. ADR-0031 adds generic Customer Channels, stable entry links/QR
codes, request media/verified observations and exact selectable Offer Options.
ADR-0032 adds Store team routing and optional exact-version quotation release
approval. The owner approved the revised dependency-ordered 17-ticket batch
through 2026-08-10. Tickets 01, 02, 03, 11, 03A and 05 are complete. Tickets 04
and 04A have source-complete foundations. Ticket 05 adds the shared source/API,
public Product-inquiry and explicit product-selected generic WhatsApp adapters,
with combined focused, verified-Neon and desktop/mobile browser acceptance.
Ticket 06 is the active source frontier. Production schema/provider
operations remain separately authorized.

Pharmacy Commerce is the first regulated vertical and retains its completed
implementation evidence and outstanding production gates. The approved second
validation vertical is an appointment-based business such as a salon or
consultation practice.

## Sources Of Truth

- Decision: `.brain/decisions/ADR-0029-service-commerce-platform-core-and-vertical-capability-extensions.md`
- Progressive Catalog/Pharmacy amendment:
  `.brain/decisions/ADR-0030-progressive-catalog-and-thin-pharmacy-extension.md`
- Customer Channels/media/Offer Options amendment:
  `.brain/decisions/ADR-0031-customer-channels-generic-request-media-and-selectable-offers.md`
- Store team/Quote release amendment:
  `.brain/decisions/ADR-0032-store-team-routing-and-quote-release-approval.md`
- Specification: `.scratch/service-commerce/spec.md`
- Approved tickets and execution order: `.scratch/service-commerce/issues/README.md`
- Midday migration contract: `.scratch/service-commerce/midday-migration-contract.md`
- Policy release gate: `.brain/runbooks/service-commerce-policy-release.md`
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
- Generic request media: private Media Assets, typed Source Attachments,
  Human-Verified Observations, safety/retry/grants and baseline retention.
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

1. An operator reviews a fingerprinted request line against an existing
   Offering or creates a private `DRAFT` Item/Variant/Offering.
2. Generic Service/Inquiry wording is explicitly an unverified source snapshot:
   it may rank candidates, but only the operator-confirmed Catalog name/alias is
   reusable truth. Prescription uses human-verified line evidence, and Ticket
   04A will add revisioned generic Human-Verified Observations. Raw customer
   text, OCR and provider payloads never become Catalog truth automatically.
3. Price suggestions show attributable current Offering price, recent accepted
   Quote or completed sale, Store-first and Tenant-wide only when authorized.
   Each suggestion includes source, currency and effective time.
4. The operator may enter a different Quote price. It changes only the
   immutable Quote version unless a separate confirmed command updates the
   reusable Catalog price and records a `CatalogPriceChange`.
5. A Quote, request or sale never invents stock. Exact inventory reservations
   require configured balance sources and sufficient quantity. A progressive
   Product can instead use an explicit expiring manual/procure-to-order
   availability commitment when Store and vertical policy permit it. Tracked
   and manual evidence commit a maximum quantity that a Quote cannot exceed.
   Tracked applies only to an active, inventory-configured Offering; a private
   draft remains manual/unavailable until explicit Ticket 06A graduation.
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
- private customer-request attachments;
- Store team routing and quotation release policy;
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
Ticket 11 now owns the authoritative jurisdiction/evidence decision boundary.
The earlier profile allowlist remains restriction-only compatibility input and
cannot grant a capability.

## Vertical And Jurisdiction Policy

Ticket 11 implements one server-only policy evaluator for the exact Store,
vertical, jurisdiction, channel and subject. Outcomes are `allowed`,
`restricted`, `pending_evidence`, `expired_approval` and `prohibited`. Current
decisions are revisioned; effective/expiry windows, private evidence/licence/
approval references, reviewer and reason are explicit. Missing Store
jurisdiction, absent or malformed evidence, expiry, revocation, ambiguous or
changed scope all fail closed. No cache is used, so every activation, request,
public action and job execution reads current facts and appends a safe audit.

Owner/Admin release managers use protected revisioned commands to set or revoke
decisions. Safe list responses omit private references; a separately
authorized detail read returns them and is audited. Denied list/evidence reads,
jurisdiction mismatches, stale revisions, write races and unauthorized override
attempts are also audited without exposing evidence in logs, public errors,
URLs or job payloads.

Activation and active-profile edits require at least one actually permitted
runtime route. Pharmacy activation requires web/staff channel decisions before
the public channel is created, plus intake, Quote, payment and enabled
fulfilment paths. Later WhatsApp binding activation requires both its channel
and intake decisions. Public and staff media uploads, public re-upload, checkout,
fulfilment selection and every pickup/delivery mutation recheck policy before
their governed write. Outbound payment/fulfilment intents are created only when
WhatsApp remains allowed; the commercial operation still completes when only
the notification is prohibited. WhatsApp rechecks before inbound content
persistence, at inbound/outbound claim, and again immediately before provider
send. Provider adapters and UI render the result; they do not decide policy.

Nigeria Pharmacy WhatsApp defaults to `prohibited`. A technically active
Connection never activates its Store binding or permits intake/send without an
unexpired explicit written approval decision. QA fixtures use synthetic,
fixture-only approval references; no real business approval is claimed.
Progressive draft capture, Catalog publication, procure-to-order, reusable
price promotion and managed-inventory graduation are independent policy
subjects rather than one broad Catalog switch.

## Customer Request Interoperability

Ticket 03 implements one typed, customer-safe projection across the three
approved source kinds without introducing a universal request aggregate. The
projection contains the typed source reference, normalized lifecycle state,
Store identity, capability/readiness states and currently allowed customer
actions. Source loading is selected through one exhaustive registry after
Tenant, Store, actor and active-profile checks; missing, stale and cross-scope
references fail closed.

`ServiceRequest` and `PrescriptionRequest` retain their existing persistence,
public bearer-token routes, private management detail, review commands and
audit behavior. Prescription projection reads only its status and emits the
neutral summary `Prescription request`; it never loads or returns media,
transcripts, review content or customer identity.

`CommerceInquiry` is the third narrow source and is owned by Commerce. It is
created only for Product demand that needs identification, availability
confirmation or a Quote. Exact known Product demand is rejected before an
Inquiry transaction and stays on `add_to_cart` or `create_commercial_order`.
Its lifecycle is `received`, `needs_clarification`, `ready_to_quote`, `quoted`,
`converted`, `declined`, `withdrawn`, `expired`. Generic state commands cannot
set `quoted` or `converted`: Quote issuance owns the former and idempotent
Quote acceptance creates the Commercial Order before atomically owning the
latter. Catalog resolution alone has no Order/conversion command.

Inquiry Quote authorization/readiness is re-evaluated inside the same bounded
transaction as Quote persistence and lifecycle transition. A replay of the
same issuance identity rotates one digest-only secondary access token and
returns its raw value once; the original public Quote token remains valid and
no raw bearer token is stored. Once an Inquiry is quoted, it is bound to that
Quote command identity: a different `clientQuoteId` fails closed, while a new
immutable version under the same Quote identity remains a valid revision.
For payable Inquiry Product lines, the Quote command captures the current
Tenant/Store-scoped inventory configuration and balance revision inside the
same transaction. Accepted conversion forwards that snapshot to Commercial
Order reservation, so internal inventory revision fields never come from the
attendant or public client.

## Customer Channels And Entry Points

Business-owned channel setup lives under **Settings > Channels** with the page
title **Customer channels**. It lists multiple Tenant Connections, lifecycle,
billing owner and explicit Store bindings. `Connect WhatsApp` starts the
focused setup flow; business category may recommend defaults but never grants
policy, legal or operational authority.

The setup lifecycle is `setup -> configure -> test -> publish`. Publish creates
a stable Store customer entry page, share link and QR code. The QR resolves an
EwaTrade `/r/[token]` page and never embeds a mutable WhatsApp number, Tenant id
or Store id. The entry page reloads current Store/channel/policy facts and
shows only permitted choices such as `Request online` and `Chat on WhatsApp`.
Connection replacement therefore does not invalidate printed QR codes.

The `configure` stage also includes **Team & routing** and **Quotation
approval** for each Store. Team assignments reference accepted active Tenant
memberships; `Add team member` reuses the staff invite flow rather than creating
a channel account. A membership may be assigned as an attendant, quotation
approver, pharmacist or any permitted combination. The first two are generic
Store capabilities; pharmacist authority remains Pharmacy-owned.

The explicit default release mode is `attendant_can_release`, presented as
`Require approval before sending` switched off. Assigned attendants can prepare
and release a Quote without another decision. When approval is enabled, at
least one selected active Store approver other than the Quote creator must
approve the exact current Quote Version before it becomes customer-visible.
Although configured in Customer Channels onboarding, this is a Store Commerce
policy and governs web, staff, QR and WhatsApp equally.

Generic connection, binding, link and QR configuration moves out of
Prescription settings. Category-specific compliance retains Pharmacy roles,
consent, professional policies and clinical operating controls.

## Channel-Neutral Intake

One strict intake envelope now carries `web | staff | whatsapp`, an opaque
entry/Store/inbound-event context, client and provider idempotency, consent and
one explicit source intent. The shared dispatcher resolves the current Store,
active attendant, channel/policy state and source boundary before calling the
authoritative Commerce Inquiry, Service Request or Prescription Request
command. It never infers a source from free text and exact Product selection
returns `use_cart` rather than creating an artificial Request.

The stable `/r/[token]` page exposes only currently allowed source choices: it
can open `/request/[token]` for a Product Inquiry and delegates Pharmacy to its
existing secure Prescription entry capability rather than routing clinical
content through the generic page.
Its server action re-resolves the entry capability before accepting customer
content. The WhatsApp Product option includes an allowlisted `intent:product`
selection in the initial context message; conversation state preserves that
choice by Store, and the generic durable worker rejects unselected messages
with `source_selection_required`. A selected bag image/document creates or
replays the Commerce Inquiry, records its provider descriptor against the
current source line/version and delegates private retrieval and safety to the
Ticket 04A media jobs. Pharmacy WhatsApp continues through its existing
source-owned clinical handler.

Channel attribution is additive: non-staff records do not fabricate a User,
staff preserves its exact actor, provider events are Tenant-idempotent, and
public/API results contain only the accepted source reference or a typed safe
recovery. Entry revision or claimed inbound-event state is checked again inside
the same transaction that writes the source, closing revoke/write races. The
verified Neon acceptance proves all three origins for Product Inquiry and
Generic Service, replay and exact-Product cart recovery. Focused source-owned
suites provide the progressive Catalog, image/PDF, Pharmacy, cross-scope,
revocation and central-branch rows. The public entry and Product Inquiry flow
also passed desktop/mobile Portless browser QA against a temporary verified-
Neon fixture with no console errors; cleanup was verified explicitly.

## Generic Request Media

Any eligible source can receive an image or approved document through web,
staff-assisted or WhatsApp intake:

`attachments` is a disabled-by-default Store capability. Business category may
recommend it, but current channel/source/provider/policy readiness is evaluated
server-side before customer content or staff access is permitted.

1. A private Media Asset records Tenant/Store, channel origin, content digest,
   allowlisted metadata, safety/lifecycle, retry, access and retention facts.
2. A typed Source Attachment binds the asset to one authorized current
   Service Request, Commerce Inquiry or Prescription Request/version.
3. An authorized human may create a revisioned Human-Verified Observation such
   as `bag / red / small`.
4. Progressive Catalog may match/link/create a private draft only from that
   verified fact. Raw media, customer text, provider payload, safety output or
   automated classification never becomes Catalog/price/stock/Order truth.

Provider media retrieval, storage and safety work uses identifier-only jobs
with bounded retry. Staff viewing uses short-lived server-authorized grants and
restores retry/reauthorization after expiry or embed failure. Public projections
contain safe status/recovery only, never object keys, provider ids, signed URLs
or customer content.

Pharmacy may reuse generic bytes/storage/grant mechanics while retaining an
authoritative clinical `PrescriptionMedia` extension for original-versus-OCR
comparison, human line verification, pharmacist release, sensitive access,
regulated retention and break-glass. Generic safety is not clinical approval.

## Selectable Offer Options

A Commerce Quote may expose immutable mutually exclusive Offer Options. For a
bag request, `red small - NGN 20,000` and `black large - NGN 30,000` are choices,
not two additive payable lines. Each option owns exact lines, availability,
fulfilment and total. Selection is current-version/expiry guarded, idempotent
and revalidates availability; only the selected option may be accepted, ordered,
reserved or paid. Existing simple Quotes migrate as one default option.

Quote preparation and customer release are separate server commands. The
default attendant mode may perform both atomically. Approval-required mode
keeps the current version as private `DRAFT` with a `pending` approval record,
without a usable acceptance token or outbound intent, and leaves the source in
its pre-Quote state. The exact-version approval transaction alone changes it to
`ISSUED`, transitions the source to quoted, records issued audit/usage facts and
creates the public capability. Rejection retains a `rejected` decision and
requires a new immutable version; revision supersedes only a still-pending
decision and emits no issued fact.

## Customer Lifecycle

1. The customer enters through a stable Store link/QR, staff-assisted flow or
   the Store's WhatsApp identity.
2. The channel resolves the Tenant, Store, capability profile and appropriate
   source aggregate before content is persisted.
3. The business clarifies intent and either accepts direct intake, prepares a
   versioned Quote for immediate or approval-gated release, or offers valid
   booking slots.
4. The server projects only the actions valid for the current version and
   policy: `Request quote`, `Choose option`, `Book`, `Pay now`, `Pick up`, `Delivery`,
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
- Inbound image/document descriptors flow to generic request-media ingestion
  after Connection/Store/policy resolution. Communications does not call a
  Prescription storage command or interpret the attachment.

## Pharmacy Vertical

Pharmacy is a thin regulated extension of the single Service Commerce
workspace. Its current channel, Catalog-adoption, Quote, payment, pickup,
delivery and reporting implementations remain compatible during migration but
are not intended to survive as a second commerce platform after the approved
switch and contraction gates. Pharmacy continues to retain:

- clinical Prescription media records and additional professional access;
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

As checked against Meta's published policy on 2026-08-10, drugs and healthcare
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

The bag seller is a separate non-regulated media/Commerce proving seam, not a
replacement second vertical. It validates generic attachment, observation,
Progressive Catalog, Offer Option, Quote/payment and fulfilment behavior before
the appointment vertical validates booking/resource reuse.

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
2. Add capability/readiness and source interoperability seams, then the
   vertical-policy seam
   without changing existing pharmacy or generic service behavior.
3. Add narrow Commerce Inquiry plus Progressive Catalog capture, matching,
   price suggestions and explicit price promotion.
4. Generalize WhatsApp Connection/Binding, move setup to Customer Channels and
   publish stable Store entry links/QR codes with Store attendant routing.
5. Add generic private request media/attachments/verified observations, then
   let channel-neutral intake consume the stable entry point.
6. Reuse Quote, selectable Offer Option, payment, booking, pickup and delivery
   capabilities; add optional exact-version quotation approval; and prove
   graduation from progressive Catalog to managed inventory.
7. Adapt Pharmacy as a thin regulated extension and prove no regression.
8. Prove the appointment vertical without prescription dependencies.
9. Run bag-seller, Pharmacy and appointment browser/Neon acceptance plus
   accessibility, isolation, performance, privacy,
   security and failure-recovery acceptance before duplicate orchestration is
   contracted.

All local database work uses the verified `.env.local` Neon development
database. Local Docker/PostgreSQL is prohibited. Production schema, provider or
business activation remains separately authorized.

## Execution Frontier

The owner approved the Progressive Catalog amendment on 2026-08-09 and the
Customer Channels/media/Offer Options plus Store team/Quote approval amendments
on 2026-08-10. The exact 17-ticket batch adds Tickets 03A, 04A, 06A and 06B.
Tickets 01, 02, 03, 11, 03A and 05 are complete. Tickets 04 and 04A have their
source foundations, and Ticket 05 supplies the accepted channel-neutral intake
adapters and combined origin/source/media/browser evidence. Ticket 06 is the
active source frontier. Live-provider acceptance remains open. Throughout
execution:

- no production Prisma operation without separate authorization;
- no renaming or contraction of Prescription Commerce before its approved
  switch/contraction gate;
- no live Meta/Twilio/provider mutation without separate authorization;
- no claim that Pharmacy WhatsApp is policy-approved; and
- no change to completed Prescription Commerce ticket status.
