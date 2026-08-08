# EwaTrade Prescription Commerce

Label: `ready-for-agent`

Status: ready-for-agent

Spec date: 2026-08-08

## Problem Statement

Customers and caregivers frequently receive prescriptions at hospitals,
clinics, doctors' offices, and diagnostic centres without knowing whether a
trusted pharmacy has every requested medicine, how much the available items
will cost, or when the order can be collected or delivered. They often travel
to the pharmacy only to ask those questions, repeat the journey after an item
is sourced, or coordinate through fragmented calls and WhatsApp messages that
do not provide a dependable quote, payment, packing, or fulfilment record.

The pharmacy faces the same fragmentation from the other side. Prescription
images arrive through different phones and channels. Staff retype unclear
handwriting, check stock, ask pharmacists to resolve ambiguity, prepare prices,
follow up for payment, pack orders, and coordinate pickup or delivery without
one accountable workflow. The pharmacy cannot reliably measure response time,
conversion, lost sales, availability, staff workload, delivery demand, or
whether an order was ready when promised.

The initial opportunity is a large pharmacy serving customers around a general
hospital, but a solution designed around one hospital, one distance, or one
daily-volume claim would be too narrow. The same problem occurs across nearby
and distant hospitals, clinics, doctors, diagnostics, pharmacy websites,
social channels, repeat customers, caregivers, and chronic-care workflows.

Prescription images and extracted text are sensitive. OCR can reduce retyping
but can also misread medicine names, strengths, dosage forms, quantities, or
instructions. EwaTrade must not become the prescriber, clinical decision-maker,
medicine seller, or dispensing operator. The licensed pharmacy must remain the
professional and commercial authority, and no generated text may become a
customer quote without explicit human verification and pharmacist release.

## Solution

Build EwaTrade Prescription Commerce as a pharmacy-owned digital operating
layer that converts prescription demand into a controlled Prescription Request,
an immutable pharmacy-released Quote, a paid Commercial Order, and one explicit
fulfilment route: pickup or eligible delivery.

A Store publishes a neutral QR code and shareable link. Scanning the QR code
opens a phone-first channel selector that offers `Continue online` or
`Continue on WhatsApp`. Online customers submit a prescription image or PDF,
contact details, consent, and fulfilment intent. WhatsApp opens the pharmacy's
configured chat and routes inbound messages and media into the same
Prescription Request queue. Staff may also create the same request on behalf
of a walk-in or caller. The QR code contains only Store, source, and campaign
context; it never contains customer or prescription data.

Private prescription media is validated, scanned, encrypted, and stored behind
time-limited access. An asynchronous OCR adapter produces a transcription
draft with ordered lines and confidence indicators. An attendant must compare
every generated line against the original media and explicitly confirm or
correct it. A request cannot advance while any line is unverified. A user with
the Store's pharmacist-release capability then resolves ambiguity, prescription
validity, restricted-item policy, permitted alternatives, medicine mapping,
availability, quantity, and price. The system assists this work but never
diagnoses, prescribes, substitutes, approves, or dispenses automatically.

The pharmacist may release a full Quote, a partial Quote with explicit
unavailable outcomes, request customer clarification, or decline the request.
Every issued Quote is versioned, expires, and exposes only the current version
through a scoped customer token. Alternatives are clearly labelled and require
customer acceptance. The customer chooses pickup or delivery before payment
whenever fulfilment changes the fee, promise, or eligibility. Pickup creates a
packing and ready handoff with a pickup code and optional authorised collector.
Delivery uses Store-configured service zones, medicine-eligibility rules, fees,
promise windows, and courier assignment. The first pharmacy may configure a
General Hospital/campus zone at NGN 500, while other destinations are
calculated or manually confirmed. Neither that name nor that price is a global
product rule.

Once the exact current total is fixed, accepting the current Quote
idempotently creates one Commercial Order for the quoted Product Offerings and
their immutable snapshots. The customer may pay online through provider-hosted
checkout; staff may record permitted offline payment methods using the existing
payment ledger.

Customers receive neutral status notifications through their selected channel
and use a scoped status page for sensitive details. Pharmacy staff use one
role-based queue with owners, timers, escalation, audit history, packing,
handoff, and exception handling. Management sees de-identified operational and
commercial reporting. EwaTrade's commercial usage meter records configured
branch subscription, implementation, completed-order, delivery-coordination,
and premium-service events without changing the pharmacy's medicine pricing or
clinical responsibility.

## User Stories

1. As a customer, I want to scan a pharmacy QR code, so that I can begin without
   installing an app.
2. As a customer, I want the QR page to offer online and WhatsApp routes, so
   that I can use the channel I trust.
3. As a customer, I want a shared web link to open the same channel selector,
   so that a hospital, clinic, doctor, or caregiver can send it to me.
4. As a customer, I want the QR code to contain no personal or prescription
   data, so that public posters do not expose me.
5. As a customer, I want the online flow to work well on a low-width phone, so
   that I can complete it from a hospital ward or waiting area.
6. As a customer, I want to photograph a prescription or upload an image or
   PDF, so that I can use the document I already have.
7. As a customer, I want capture guidance before upload, so that the pharmacy
   receives a legible, complete image.
8. As a customer, I want immediate feedback when an image is unreadable,
   incomplete, unsupported, or too large, so that I can correct it quickly.
9. As a customer, I want to submit more than one page, so that multi-page
   prescriptions stay in one request.
10. As a customer, I want to provide my name and at least one reachable contact
    method, so that the pharmacy can clarify the request and send the quote.
11. As a caregiver, I want to identify that I am ordering for another person,
    so that the pharmacy can apply its authorised-collector and clarification
    process.
12. As a customer, I want to see a plain-language privacy notice and give the
    required consent, so that I understand how the image and contact data are
    used.
13. As a customer, I want to choose an initial preference for pickup or
    delivery, so that staff can prepare the appropriate promise.
14. As a customer, I want to indicate the hospital, clinic, doctor, diagnostic
    centre, pharmacy channel, or other source, so that the pharmacy can improve
    its service without inferring medical information.
15. As a customer, I want a receipt that my request was received, so that I do
    not submit it repeatedly.
16. As a customer, I want a safe request reference, so that I can ask for help
    without sharing the prescription again.
17. As a WhatsApp customer, I want the channel selector to open the pharmacy's
    official chat, so that I do not message an unknown number.
18. As a WhatsApp customer, I want the chat to prefill only neutral Store and
    source context, so that sensitive content is not placed in a public link.
19. As a WhatsApp customer, I want my inbound image and messages to create or
    join one Prescription Request, so that channel conversations do not become
    duplicate orders.
20. As a customer, I want the pharmacy to ask for a clearer image or missing
    page through my selected channel, so that the request can continue without
    a visit.
21. As a customer, I want neutral notifications that avoid medicine details on
    a lock screen, so that status updates do not expose sensitive information.
22. As a customer, I want sensitive quote details behind a scoped link, so that
    forwarding a notification does not expose the full request indefinitely.
23. As a customer, I want to see whether each requested line is available,
    unavailable, replaced by an approved alternative, or needs clarification,
    so that the result is not ambiguous.
24. As a customer, I want every alternative clearly labelled, so that I do not
    mistake it for the originally written medicine.
25. As a customer, I want to see item name, strength or presentation as
    approved by the pharmacy, quantity, unit price, line total, fees, and final
    total, so that I can make an informed decision.
26. As a customer, I want a Quote expiry time, so that I know how long price and
    availability are held.
27. As a customer, I want only the latest Quote version to be acceptable, so
    that I cannot pay an outdated amount.
28. As a customer, I want to accept a partial Quote, so that available items do
    not have to wait for unavailable ones.
29. As a customer, I want to decline or abandon a Quote without creating a
    sale, so that asking for a price does not obligate me.
30. As a customer, I want repeated taps on accept or pay to remain safe, so that
    poor connectivity does not duplicate the Order or charge.
31. As a customer, I want to pay online using a trusted hosted checkout, so
    that I do not send card details to EwaTrade or a staff member.
32. As a customer, I want a receipt and visible paid balance, so that payment
    status is clear.
33. As a customer, I want a failed or abandoned payment to be retryable against
    the same Order, so that I do not need a new Quote.
34. As a customer, I want an approved refund to appear against the original
    Order, so that the financial history remains understandable.
35. As a pickup customer, I want the pharmacy to pack before I arrive, so that
    I spend less time waiting.
36. As a pickup customer, I want a ready notification rather than an optimistic
    estimate, so that I travel only when the Order is actually ready.
37. As a pickup customer, I want a pickup code or approved identification
    method, so that the Order is handed to the correct person.
38. As a caregiver, I want to name an authorised collector, so that another
    person can collect under the pharmacy's policy.
39. As a delivery customer, I want to enter or select a destination, so that
    the pharmacy can determine whether delivery is supported.
40. As a delivery customer, I want to see the applicable service zone, fee, and
    promise before I pay, so that delivery cost is not surprising.
41. As a customer in the initial hospital/campus zone, I want the configured
    local fee shown as NGN 500 when applicable, so that the pilot offer is
    clear.
42. As a customer outside a fixed zone, I want the pharmacy to calculate or
    confirm the fee, so that the system does not invent a universal price.
43. As a delivery customer, I want to know when an item cannot be delivered,
    so that restricted, controlled, cold-chain, or unsuitable medicines are not
    dispatched incorrectly.
44. As a delivery customer, I want status updates for assigned, collected, in
    transit, delivered, failed, or rescheduled handoffs, so that I know what is
    happening.
45. As a customer, I want delivery proof and issue-resolution status when
    permitted, so that disputed handoffs can be investigated.
46. As a walk-in customer, I want staff to create the same Prescription Request
    for me, so that every channel uses one operating process.
47. As an attendant, I want one queue for web, WhatsApp, and staff-assisted
    requests, so that no channel is forgotten.
48. As an attendant, I want duplicate detection based on safe request and media
    identities, so that repeated uploads do not create parallel work silently.
49. As an attendant, I want each request to show source, channel, age, owner,
    and current blocker, so that I know what to handle next.
50. As an attendant, I want service-level timers and escalation, so that urgent
    or overdue requests are visible.
51. As an attendant, I want the original image beside the OCR draft, so that I
    can compare them efficiently.
52. As an attendant, I want OCR lines kept in source order, so that line-by-line
    verification follows the document.
53. As an attendant, I want low-confidence text highlighted, so that I can focus
    attention without assuming high-confidence text is correct.
54. As an attendant, I want to confirm or correct every line individually, so
    that a bulk approval cannot bypass review.
55. As an attendant, I want the system to block completion while any line is
    unverified, so that raw OCR output cannot reach quotation.
56. As an attendant, I want corrections to retain original text, corrected
    text, reviewer, and timestamp, so that the transcription is auditable.
57. As an attendant, I want to mark a line unreadable rather than guess, so that
    the pharmacist or customer can clarify it safely.
58. As an attendant, I want to request a clearer image and suspend the service
    timer under an approved reason, so that customer delay is not mistaken for
    staff delay.
59. As an attendant, I want OCR failure to fall back to manual transcription,
    so that provider downtime does not force unsafe automation or block the
    pharmacy indefinitely.
60. As an attendant, I want access only to Stores and requests assigned to me,
    so that prescription data does not cross tenant or branch boundaries.
61. As a pharmacist, I want a separate professional-review queue, so that only
    fully verified requests reach me.
62. As a pharmacist, I want the original media, verified transcription, and
    correction history visible together, so that I can review the request in
    context.
63. As a pharmacist, I want to mark prescription validity and professional
    disposition explicitly, so that release is not inferred from a Quote draft.
64. As a pharmacist, I want to request customer or prescriber clarification, so
    that ambiguity is resolved instead of guessed.
65. As a pharmacist, I want restricted-item and delivery-eligibility rules to
    fail closed, so that unsuitable items cannot be sold or dispatched through
    the workflow.
66. As a pharmacist, I want each verified line mapped to an active Product
    Offering or given a non-quoted disposition, so that accepted lines create
    valid commerce and stock records.
67. As a pharmacist, I want stock availability shown using available rather
    than raw on-hand quantity, so that existing reservations are respected.
68. As a pharmacist, I want to approve an alternative only with a recorded
    reason and link to the requested line, so that substitution is transparent.
69. As a pharmacist, I want to issue a full or partial Quote and explicitly mark
    unavailable lines, so that the customer sees the complete outcome.
70. As a pharmacist, I want to decline a request with an allowlisted reason and
    optional customer-safe explanation, so that internal details are not
    exposed accidentally.
71. As a pharmacist, I want Quote release to record my identity, Store,
    timestamp, and current request revision, so that stale or anonymous release
    is impossible.
72. As a pharmacist, I want a changed request or medicine mapping to require a
    new Quote version, so that issued history is immutable.
73. As a branch manager, I want to assign attendants and pharmacist reviewers,
    so that ownership is visible across shifts.
74. As a branch manager, I want to configure operating hours and service-level
    targets, so that customer promises reflect branch capacity.
75. As a branch manager, I want to configure pickup and delivery policies, so
    that each Store controls its supported fulfilment routes.
76. As a branch manager, I want to configure named delivery zones, fees,
    promise windows, and manual-quote zones, so that local and distant service
    lanes are explicit.
77. As a branch manager, I want to configure medicine categories excluded from
    delivery, so that couriers do not receive unsuitable Orders.
78. As a branch manager, I want a packing queue ordered by promise time, so that
    accepted Orders are prepared reliably.
79. As a packer, I want to confirm each quoted Order line and quantity during
    packing, so that the handoff matches the paid Order.
80. As a packer, I want to report an unavailable or damaged item before ready
    status, so that the customer can receive a revised resolution.
81. As a packer, I want ready status blocked until the pharmacy's required
    checks are complete, so that speed does not bypass quality.
82. As a cashier, I want permitted cash, bank, card, and POS payments recorded
    in the existing payment ledger, so that online and in-person collection
    reconcile consistently.
83. As a cashier, I want refunds limited to collected amounts and authorised
    roles, so that financial corrections remain safe.
84. As a dispatcher, I want only delivery-eligible, paid, and ready Orders in my
    assignment queue, so that I do not collect unfinished or prohibited items.
85. As a dispatcher, I want courier assignment, collection, delivery, failure,
    and proof events recorded, so that handoff history is complete.
86. As a courier, I want only the minimum address, contact, and handoff details
    required for the delivery, so that prescription and clinical content stays
    private.
87. As an owner, I want Prescription Commerce enabled per Store, so that rollout
    can be controlled branch by branch.
88. As an owner, I want only explicitly authorised users to verify or
    professionally release prescriptions, so that ordinary POS access is not
    enough.
89. As an owner, I want pharmacist-release assignments to include credential
    and verification metadata, so that the Store can evidence its operating
    authority.
90. As an owner, I want QR campaigns attributed by source without customer
    data in the QR, so that hospital, clinic, and pharmacy-channel performance
    can be compared safely.
91. As an owner, I want dashboards for request volume, Quote rate,
    quote-to-paid conversion, turnaround, ready-on-promise, availability,
    delivery selection, and cancellation, so that the service can be managed.
92. As an owner, I want OCR clarification and line-correction rates, so that AI
    quality and staff workload are visible.
93. As an owner, I want safety, privacy, and pharmacy-error guardrails reported
    separately from growth metrics, so that commercial success cannot hide
    unsafe operation.
94. As a finance user, I want medicine revenue and payments read from Commerce,
    so that reporting does not reconstruct money from workflow events.
95. As a finance user, I want delivery fee, courier payout, and coordination
    margin separated, so that delivery economics are transparent.
96. As an EwaTrade commercial operator, I want implementation, branch,
    completed-order, delivery-coordination, and premium usage events, so that
    contracts can be billed without changing customer prices.
97. As a privacy officer, I want controller/processor responsibilities and the
    approved lawful basis recorded for each deployment, so that production does
    not rely on an implicit assumption.
98. As a privacy officer, I want configurable media and transcription retention,
    so that sensitive content is not kept indefinitely.
99. As a privacy officer, I want deletion to remove private media and derived
    text while retaining a non-sensitive audit tombstone where legally allowed,
    so that erasure and accountability can coexist.
100. As a privacy officer, I want access, export, correction, restriction, and
     incident workflows, so that data-subject and breach obligations can be
     handled deliberately.
101. As a security administrator, I want prescription media encrypted and
     available only through short-lived signed access, so that no permanent
     public media URL exists.
102. As a security administrator, I want MIME validation, size limits, malware
     scanning, and failed-closed processing, so that uploaded media cannot
     become an unsafe delivery path.
103. As a security administrator, I want raw tokens stored only as digests, so
     that a database read does not reveal customer access links.
104. As an auditor, I want append-only events for media access, OCR, verification,
     professional release, Quote versions, payment, packing, and handoff, so
     that material decisions are traceable.
105. As an auditor, I want logs and analytics to exclude prescription text and
     medicine details by default, so that observability does not become a data
     leak.
106. As a support agent, I want a safe request reference and allowlisted status
     projection, so that I can help without unnecessary clinical access.
107. As a platform administrator, I want provider health and failure queues for
     storage, OCR, WhatsApp, payment, and dispatch, so that operational failures
     can be resolved without editing domain truth.
108. As a developer, I want provider adapters behind stable contracts, so that
     OCR, storage, WhatsApp, payment, and delivery vendors can change without
     rewriting the Prescription Request lifecycle.
109. As a developer, I want idempotency identities and payload hashes on every
     external command, so that retries and duplicate webhooks are safe.
110. As a developer, I want one acceptance lifecycle test from submission to
     fulfilled Order, so that the product boundary remains coherent across
     modules.
111. As a pharmacy owner, I want to connect a pharmacy-owned WhatsApp Business
     Account and number, so that customers recognise the pharmacy they are
     entrusting with prescription media.
112. As a pharmacy owner, I want repeatable Meta Embedded Signup, so that I can
     verify ownership and grant bounded messaging access without giving raw
     credentials to EwaTrade staff.
113. As a branch manager, I want a central group number or branch-specific
     number bound explicitly to each Store, so that inbound requests reach the
     accountable operating queue.
114. As a customer, I want my conversations with different pharmacies isolated,
     so that the same phone number never merges my requests across businesses.
115. As a platform administrator, I want one verified webhook to route many
     pharmacy-owned numbers by recipient phone-number id, so that scale does not
     require one deployment per pharmacy.
116. As a security administrator, I want pharmacy provider credentials stored
     through encrypted or managed-secret references with rotation and
     revocation, so that Tenant secrets never enter clients or logs.
117. As a customer, I want quick actions for `Pick up`, `Delivery`, and
     `Ask pharmacy`, so that I can resolve fulfilment without typing ambiguous
     instructions.
118. As a customer, I want `Review & pay` only after the exact fulfilment fee and
     total are fixed, so that a WhatsApp button never charges or confirms an
     outdated amount.

## Implementation Decisions

### 1. Product and bounded-context ownership

- `Prescription Request` is a new Customer Access aggregate for unconfirmed
  prescription intent. It is not a Service Request, medical record, diagnosis,
  prescription, Quote, Order, or stock reservation.
- Prescription Operations owns prescription media references, OCR processing
  state, transcription lines, attendant verification, professional review,
  clarification, line disposition, and operational audit events.
- Catalog continues to own Product Items, Sellable Variants, Product Offerings,
  Inventory Units, Store availability, and current prices.
- Commerce owns generic versioned Quotes, Quote acceptance, Commercial Orders,
  immutable Offering Snapshots, payment/refund facts, cancellation, and
  customer money.
- Inventory owns balances, reservations, fulfilments, returns, and corrections.
  Prescription Operations reads availability projections but never edits stock
  directly.
- Fulfilment owns the Order's pickup or delivery plan, packing, readiness,
  pickup handoff, delivery zone, courier assignment, delivery events, and proof.
- Communications owns channel preference, notification intent, rendered
  messages, inbound/outbound provider facts, and delivery attempts.
- Reporting owns tenant-scoped, de-identified projections. It never becomes a
  second source of request, clinical, money, stock, or fulfilment truth.
- EwaTrade provides technology and workflow. The licensed pharmacy remains the
  seller, professional authority, and dispensing operator.

### 2. Commerce Quote generalisation

- Generalise the implemented Service-specific Quote aggregate into a
  Commerce-owned Quote that can originate from either a Service Request or a
  Prescription Request without using an unvalidated JSON polymorphic source.
- Existing Service behaviour, version history, expiry, scoped acceptance,
  idempotency, Commercial Order creation, and customer projections must remain
  unchanged through the migration.
- A Quote has exactly one typed source relation when created from a request.
  Direct staff Quotes may have no request source only where existing Commerce
  policy permits.
- Each Prescription Quote Version records outcomes for every verified
  Prescription Request Line: `QUOTED`, `UNAVAILABLE`, `NEEDS_CLARIFICATION`,
  or `DECLINED`.
- A quoted outcome requires one active, Store-available Product Offering,
  positive exact quantity, immutable display snapshot, unit price in integer
  minor units, and any alternative-to-requested-line metadata.
- Only `QUOTED` outcomes become Commercial Order Lines. Non-quoted outcomes
  remain visible on the Quote but never create Order or stock facts.
- Quote issuance requires the current Prescription Request revision, all
  transcription lines verified, professional release completed by an authorised
  pharmacist, Store/currency agreement, and at least one quoted line.
- Issued Quote Versions are immutable. A change creates a new current version
  and supersedes the prior version. Only the current, issued, unexpired version
  can be accepted.
- Quote acceptance is idempotent and atomically creates one Commercial Order,
  Product reservations, immutable Offering Snapshots, fulfilment intent, and
  the request conversion link.

### 3. Prescription Request lifecycle

- The aggregate uses explicit lifecycle states rather than deriving readiness
  from UI steps:
  `RECEIVED`, `MEDIA_REVIEW`, `NEEDS_CLEARER_MEDIA`, `TRANSCRIBING`,
  `ATTENDANT_VERIFICATION`, `PHARMACIST_REVIEW`, `NEEDS_CLARIFICATION`,
  `READY_TO_QUOTE`, `QUOTED`, `CONVERTED`, `DECLINED`, `WITHDRAWN`, and
  `EXPIRED`.
- `DECLINED`, `WITHDRAWN`, `CONVERTED`, and `EXPIRED` are terminal. A new
  customer submission after a terminal outcome creates a new request linked as
  a follow-up rather than reopening history.
- Every mutation uses an expected revision. A stale attendant, pharmacist, or
  manager action returns a typed conflict and never overwrites newer work.
- Customer waiting and pharmacy working time are separate timers. Approved
  waiting reasons may pause the pharmacy service-level clock without deleting
  elapsed history.
- Request source and channel are separate: source describes where demand came
  from; channel describes how the customer interacted.
- Store, Tenant, customer snapshot, request reference, source, campaign,
  consent version, preferred channel, initial fulfilment intent, timestamps,
  and idempotency identity are durable request facts.
- Customer contact is snapshotted on the request and may link to the Tenant
  Customer directory when matching rules permit. It is never used as the sole
  secret for public access.

### 4. Media and privacy-safe storage

- Prescription binary content is stored only in approved managed private object
  storage. The database stores asset identity, storage key, original filename,
  media type, size, checksum, page order, processing state, retention deadline,
  and audit metadata.
- Supported launch media is JPEG, PNG, HEIC where the media pipeline can safely
  normalise it, and PDF. Maximum file count and size are Store/platform
  configuration with conservative platform caps.
- Upload uses short-lived authenticated or scoped signed instructions. Storage
  keys are tenant- and Store-scoped, unpredictable, and never customer-facing.
- MIME signature validation, decompression/page limits, malware scanning,
  image/PDF normalisation, and safety status must succeed before OCR or staff
  viewing. Client-supplied media type or safety state is never trusted.
- Staff view media through short-lived, authorised access. Every access is
  auditable. Permanent public URLs are forbidden.
- Object storage, database metadata, logs, backups, OCR provider transfer, and
  support tools follow the approved controller/processor and subprocessor
  contract.
- Retention is configurable by approved deployment policy. Expiry removes the
  private media and derived transcription where required, revokes access, and
  retains only an allowlisted non-sensitive tombstone and aggregate metrics.
- Commercial pilot analytics and exports must never contain patient names,
  phone numbers, prescription images, diagnoses, medicine details, addresses,
  or raw transcription.

### 5. OCR and transcription

- OCR runs asynchronously behind a provider-neutral adapter and durable job.
  The provider request is idempotent per normalised media revision.
- OCR output is a draft, never domain truth. It records ordered source page,
  source region when available, raw text, confidence, provider/model version,
  processing timestamps, and failure reason.
- OCR output may not map medicines, choose quantities, create Quote lines,
  suggest substitutions, change stock, or release a customer message.
- The system shows the original media and draft side by side. Every line must
  end in `CONFIRMED`, `CORRECTED`, or `UNREADABLE`, with reviewer and timestamp.
- Bulk verification is forbidden. High-confidence text still requires explicit
  line review.
- Any changed media revision invalidates prior derived OCR and line verification
  for the affected pages and returns the request to the appropriate review
  state.
- OCR failure exposes a manual transcription path with identical line review
  and audit requirements.
- Prompts, provider payloads, logs, traces, and error reporting must not retain
  sensitive text beyond the approved processing contract.

### 6. Pharmacist professional-release gate

- Ordinary Tenant role or POS permission does not grant professional release.
  A Store-scoped Prescription Role Assignment grants attendant verification,
  pharmacist review/release, packing, dispatch, management, or audit capability.
- Pharmacist release requires an active Store assignment with credential
  reference, verification status, verifier, effective date, and optional expiry
  according to the approved operating policy.
- Owners and Admins may manage assignments but cannot perform pharmacist release
  unless they independently hold an active pharmacist assignment.
- The pharmacist reviews original media, verified transcription, corrections,
  customer clarification, line mapping, restricted-item policy, delivery
  eligibility, availability, quantity, price, and any alternative.
- Professional review produces explicit line dispositions and one request-level
  release decision. UI navigation or Quote drafting never implies approval.
- Alternatives link to the requested line and record pharmacist, reason,
  customer-safe explanation, and the Product Offering proposed. Quote acceptance
  is the customer's explicit acceptance of the labelled alternative.
- Restricted, controlled, cold-chain, expired, invalid, ambiguous, or otherwise
  excluded requests fail closed according to Store and jurisdiction policy.
- Professional release is revision-guarded and append-only. A material change
  after release invalidates `READY_TO_QUOTE` and requires a new release.

### 7. Catalog, availability, and pharmacy integration

- Every quoted medicine must map to an active Product Offering. Prescription
  text is never used directly as a sellable catalog identity.
- Available stock means on hand minus active reservations, converted through
  the Offering's exact Inventory Unit. Raw on-hand stock is not presented as
  promiseable availability.
- Staff may search the EwaTrade Catalog by medicine display name, SKU, barcode,
  variant, presentation, and approved pharmacy synonyms. Search results remain
  tenant- and Store-scoped.
- The pilot requires either an EwaTrade pharmacy catalog or an approved import/
  sync that creates stable Product Offerings and external mappings. Free-text
  order lines are not introduced to bypass Catalog and Inventory invariants.
- External POS/inventory integration is behind a Store connector. Imported
  external ids never become global identities, and sync failures surface as
  stale availability rather than silently promising stock.
- Quote issuance revalidates Offering activity, Store availability, price,
  currency, and available stock. Acceptance revalidates the same invariants and
  creates reservations atomically.
- Partial availability is first-class. The pharmacy may issue a partial Quote
  without deleting unavailable requested lines from the customer outcome.

### 8. Customer access, QR, web, and tenant-owned WhatsApp

- A Prescription Channel configuration belongs to one Store and may expose QR,
  web, WhatsApp, and staff-assisted intake independently. The Store channel
  binds to a reusable Tenant WhatsApp Connection; it does not duplicate
  provider credentials for every Store.
- QR and share links carry a revocable public channel token plus optional source
  and campaign attribution. They contain no customer, contact, request, Quote,
  prescription, or Order data.
- The channel selector is a public, responsive Storefront surface. Authenticated
  operations remain on the shared dashboard host.
- Web submission uses a scoped upload session and idempotent request command.
  The success response reveals only an allowlisted acknowledgement and request
  reference.
- WhatsApp opens the Store's configured business number with a neutral prefilled
  message containing a one-time or bounded channel context. It must not prefill
  prescription or patient content.
- The licensed pharmacy or pharmacy group owns its WhatsApp Business Account
  and public business number. EwaTrade operates the workflow integration and
  does not present one shared EwaTrade number as the permanent identity of
  unrelated pharmacies.
- The first controlled pilot may manually connect one pharmacy-owned number.
  Repeatable multi-pharmacy onboarding uses Meta Embedded Signup, directly or
  through an approved Business Solution Provider, so the pharmacy selects or
  creates its Business Portfolio and WhatsApp Business Account, verifies number
  ownership, and grants bounded messaging access without sharing raw
  credentials with staff.
- The initial provider adapter follows Midday's direct Meta WhatsApp Cloud API
  pattern. Midday's single platform-owned sender and global
  `WHATSAPP_PHONE_NUMBER_ID`/access-token configuration are reference code for
  transport behaviour only; they are not the EwaTrade multi-tenant ownership
  model. Twilio or another Business Solution Provider may be selected later
  only behind the same provider-neutral Communications contract.
- EwaTrade uses one Meta application and one verified webhook surface for all
  connected pharmacies. Each connection durably records Tenant ownership,
  WABA id, globally unique provider phone-number id, display number, connection
  state, billing owner, approved template versions, Store bindings, and an
  encrypted or managed-secret credential reference. Pharmacy access tokens are
  never stored in public configuration or one global sender environment value.
- Inbound routing first resolves the webhook recipient phone-number id to one
  WhatsApp Connection and Tenant. A valid channel context then resolves the
  Store, source, and campaign. Unknown recipient ids, cross-Tenant bindings,
  expired contexts, and ambiguous Store routing fail closed.
- One independent pharmacy normally owns one WABA and one public number. A
  multi-branch pharmacy group may bind one central number to several Stores
  only when the channel context or an explicit customer branch selection
  resolves the Store; otherwise each independently operated branch uses its own
  number. The platform does not automatically create one WABA per Store.
- Inbound WhatsApp webhook verification, Store-number routing, message/media
  ingestion, reply threading, and delivery receipts use the same provider-
  neutral Communications boundary as outbound messaging. The current outbound-
  only implementation must be extended; an inbound provider SDK is not called
  directly from Prescription Operations.
- Provider message and media ids are idempotency identities. Retries and
  out-of-order webhooks cannot duplicate requests or regress message state.
- A phone conversation may be attached to an existing request only through an
  authorised matching or customer confirmation flow; phone number alone does
  not silently merge sensitive requests.
- A WhatsApp thread identity is scoped by connection, customer WhatsApp id, and
  request or bounded channel context. The same customer may therefore contact
  different pharmacies without shared state or cross-Tenant inference.
- Public request, Quote, payment, and status tokens are scoped, revocable,
  rate-limited, optionally expiring, and stored only as digests.
- Customer status projections show only approved request milestones, current
  Quote, payment, fulfilment, customer-safe messages, and permitted proof.
  Internal notes, raw OCR, credential data, stock details, and audit internals
  are excluded.

### 9. Payment and conversion

- Quote acceptance creates the Commercial Order once even when the customer
  retries. Payment is a separate fact and does not rewrite Quote history.
- Online payment uses provider-hosted checkout and the existing provider
  adapter pattern. EwaTrade never handles raw card data.
- When pickup or delivery changes the fee, promise, or eligibility, the
  customer selects the Fulfilment Plan before the final payable Quote is
  accepted. A route change that alters customer money creates or requires the
  appropriate current Quote version; it never silently changes an accepted
  amount.
- WhatsApp exposes `Review & pay` only after the current total is fixed. The CTA
  opens a scoped EwaTrade Quote/status page and then provider-hosted checkout;
  a reply-button tap, URL visit, or payment callback never records payment.
- A signed, amount- and currency-verified webhook records the payment against
  the Commercial Order idempotently. Callback navigation alone never marks an
  Order paid.
- Cash, bank, card, and POS collection may be recorded by authorised pharmacy
  staff through the existing payment ledger. Refunds remain append-only,
  idempotent, authorised, and capped by collected value.
- Store policy decides whether an accepted Order may enter packing before full
  payment. The launch default is that delivery assignment and customer-ready
  handoff require full payment unless an approved pharmacy policy states
  otherwise.
- Customer medicine prices, discounts, taxes, service charges, and delivery fee
  are pharmacy-controlled Commerce facts. EwaTrade subscription or success fees
  are never hidden inside medicine prices.

### 10. Pickup and delivery fulfilment

- One accepted Order has exactly one active Fulfilment Plan: `PICKUP` or
  `DELIVERY`. A customer or authorised staff member may change the plan only
  before the configured lock point; the change recalculates fees and promise and
  is audited.
- Pickup records promise, packing state, ready timestamp, pickup code digest,
  authorised collector when used, handoff actor, handoff time, and exceptions.
- Delivery records destination, zone, fee, promise window, eligibility decision,
  assigned courier/dispatch provider, collection, in-transit, delivery, failure,
  reschedule, proof, and service recovery.
- Delivery addresses and contacts are sensitive operational data. Courier
  projections contain only the minimum data required for the assigned handoff
  and never include prescription media, OCR, internal notes, or pharmacist
  credentials.
- Delivery Zones are Store-owned and support named fixed-fee zones, calculated
  zones, and manual-quote zones. A zone may include service hours, promise
  window, minimum/maximum fee policy, and item eligibility.
- `General Hospital` and `NGN 500` are pilot configuration examples, not enum
  values, defaults, or hardcoded copy. Other hospitals and distant lanes use the
  same configurable model.
- Launch dispatch may use manual assignment and provider-neutral status events.
  The planned EwaTrade Dispatch internal app may consume the same contracts
  later; it is not required to make the first pilot coherent.
- Packing checks quoted Order Lines, quantities, payment policy, pharmacist
  release, and medicine eligibility. Ready status is explicit and never derived
  merely from payment or elapsed time.
- Pickup and delivery completion are immutable handoff events. Cancellation,
  failure, return, refund, and correction append new facts rather than editing
  completed history.

### 11. Staff workspace and operational behaviour

- The dashboard exposes one Store-scoped Prescription Request queue across
  online, WhatsApp, and staff-assisted channels.
- Queue filters include lifecycle state, channel, source, campaign, owner,
  assigned attendant, assigned pharmacist, age, service-level state,
  fulfilment intent, availability outcome, and exception.
- Request workspace uses progressive sections: customer/source, private media,
  OCR and line verification, pharmacist review, Catalog/availability mapping,
  Quote versions, payment, packing, fulfilment, communication, and audit.
- Staff see only actions permitted by their Tenant membership and Store-scoped
  Prescription Role Assignment. Hidden buttons are not authorization; every
  mutation enforces the same policy server-side.
- Assignment, clarification, promise, professional release, Quote issue,
  packing, ready, dispatch, handoff, cancellation, refund, and incident actions
  require explicit reason/identity where policy specifies.
- Operational fallback is defined for OCR, WhatsApp, payment, storage, and
  dispatch downtime. Fallback never permits unsafe media access, unverified
  transcription, or pharmacist-gate bypass.

### 12. Communication and notification policy

- Customer communication records intent separately from provider attempts.
  Provider failure never duplicates domain intent.
- Templates are Store-configurable within platform-approved categories:
  received, clearer media required, clarification required, Quote ready, payment
  received, packing, ready for pickup, courier assigned, delivered, failed,
  cancelled, refund, and service recovery.
- Provider template names, categories, languages, approval states, and versions
  are tracked per WABA even when customer-safe message intent is configured at
  Store level.
- Interactive messages use no more than the provider-supported button count and
  expose bounded actions. The standard Quote actions are `Pick up`, `Delivery`,
  and `Ask pharmacy`; delivery address or zone capture opens a scoped secure
  surface when more data is required. After the exact total is fixed,
  `Review & pay` is a URL CTA rather than a state-changing reply button.
- Button payloads carry opaque, expiring, idempotent action identities. They do
  not contain medicine names, prescription text, patient details, address, or
  an amount that can become stale.
- Free-form and reply-button messages are used only when provider policy permits
  them. Outside the active customer-service window, Communications uses an
  approved utility template or records a deferred/manual communication state.
- Notification text is neutral by default and does not include medicine names,
  prescription text, diagnosis, amount, or address unless an approved channel
  policy explicitly permits it.
- Sensitive details are read through the scoped customer status/Quote page.
- Customer channel preference is respected where available, while mandatory
  operational or legal notifications follow approved policy.
- Message rendering, provider send, webhook receipt, retry, and final status are
  auditable and idempotent.

### 13. Reporting, KPIs, and commercial usage

- Primary pilot metrics are Quote-to-paid conversion, median quotation
  turnaround, and ready-on-promise. Initial target hypotheses are 50%, ten
  minutes, and 95% respectively; they are editable decision gates, not product
  constants or promises.
- Driver metrics include request volume by hour/channel/source, image
  clarification, OCR line correction, full availability, partial availability,
  staff minutes, pharmacist minutes, delivery selection, cancellation,
  payment failure, basket value, and delivery economics.
- Guardrails include safety incidents, privacy incidents, pharmacy errors,
  unauthorised media access, restricted-item violations, and incorrect handoff.
  A guardrail failure blocks rollout regardless of conversion.
- Metrics use immutable domain events and Commerce/Inventory truth. Analytics
  never parse prescription text or reconstruct money from workflow state.
- Management reporting is tenant- and Store-scoped and supports channel/source
  attribution without exposing individual customer or medicine data.
- EwaTrade commercial metering records branch activation, recurring branch
  period, converted prescription Order, eligible delivery coordination, and
  configured premium usage. Contract prices remain external billing
  configuration and are not hardcoded in this feature.
- A completed-order fee is metered only once per converted Prescription Request
  according to the commercial contract, even when payments, retries, refunds,
  or fulfilment events repeat.
- WhatsApp cost reporting separates provider message fees, optional Business
  Solution Provider surcharge, rented-number or sender fees, and EwaTrade
  support/operations. Costs are attributed to the connection and billing owner;
  volatile external rates are never hardcoded into prescription domain logic or
  Quote pricing.

### 14. Security, audit, and compliance gates

- Production enablement is Store-scoped and unavailable until the deployment
  records approved PCN/electronic-pharmacy role, privacy responsibility,
  retention policy, media provider, OCR provider, inbound WhatsApp provider,
  payment configuration, delivery SOP, and accountable owners.
- All tenant-owned reads and writes resolve Tenant and Store context server-side.
  Public access returns allowlisted projections through scoped tokens only.
- Sensitive fields are encrypted where appropriate, omitted from logs and
  analytics, and redacted from support and error tooling.
- WhatsApp webhook signatures are verified before routing or media retrieval.
  Provider credentials use encrypted or managed-secret references with bounded
  access, rotation, revocation, and audit; Tenant-owned credentials are never
  returned to clients or copied into logs, jobs, analytics, or support views.
- Audit events record actor, effective Store/Tenant, command identity, request
  revision, event type, safe before/after status, timestamp, and reason without
  copying full prescription content into the event payload.
- Access to private media, transcription, professional review, and customer
  contact is separately observable. Break-glass access, if introduced, requires
  reason, limited duration, notification, and review.
- Incident handling can freeze a Store's new submissions, revoke public tokens,
  suspend provider processing, preserve evidence, and continue safe customer
  communication without deleting the audit trail.
- Data-subject workflows cover access, correction, restriction, portability
  where applicable, and erasure under approved legal policy.
- This feature does not claim automatic legal compliance. Production authority
  remains an explicit launch gate confirmed with pharmacy leadership, PCN
  guidance, and Nigerian privacy counsel.

### 15. Idempotency, concurrency, and failure handling

- Request submission, media finalisation, OCR enqueue/result, line verification,
  professional release, Quote version issue, Quote acceptance, payment,
  Fulfilment Plan change, packing, ready, courier events, handoff, refund,
  notification, and usage metering use stable command identities.
- Reusing a command identity with a different payload is a typed mismatch error.
- External webhooks use provider event identity plus payload verification and
  cannot directly overwrite domain state.
- Request, Quote, Order, payment, stock, and fulfilment transitions that must
  agree execute in one transaction or through an outbox/inbox workflow with
  durable reconciliation. No partial external failure is represented as
  completed domain work.
- Provider uncertainty has an explicit state and reconciliation path. Blind
  retries are forbidden where a provider may have completed a write.
- Queue consumers use leases or equivalent claims and retain retry count,
  last error, and terminal/manual-review state.

### 16. Delivery sequence

- Phase 0 completes design-partner discovery, current-state observation,
  privacy/data map, PCN and operating-authority review, pharmacy catalog and POS
  inventory, pharmacy WABA/number ownership, direct-Meta-versus-approved-BSP
  acceptance, delivery SOP, Store roles, baseline metrics, and pilot contract.
- Phase 1 establishes private media, web/staff intake, Prescription Request,
  deterministic OCR test adapter, line verification, pharmacist release,
  Product Offering mapping, versioned Quote, scoped customer status, pickup,
  and de-identified events in a non-production or shadow workflow.
- Phase 2 adds production OCR, one manually onboarded pharmacy-owned WhatsApp
  number, inbound/outbound Cloud API behaviour behind Communications, hosted
  payment, packing, configurable fixed hospital/campus delivery and manual
  other-zone quote, provider-neutral dispatch, notifications, and a controlled
  live cohort.
- Phase 3 adds approved POS/inventory sync, automated zone calculation where
  justified, stronger operations dashboards, commercial usage metering,
  Embedded Signup, multi-pharmacy webhook routing, multi-branch configuration,
  and repeatable onboarding.
- No phase advances when safety/privacy guardrails fail or when required
  authority, private media, professional release, delivery SOP, and incident
  response are incomplete.

## Testing Decisions

- Tests assert externally observable behaviour and durable invariants. They do
  not assert component internals, ORM call order, OCR implementation details,
  provider SDK shapes, or private helper functions.
- The primary and highest test seam is one Prescription Commerce lifecycle
  harness at the domain repository/API boundary. It creates a Store with
  Product Offerings and stock, opens a public channel, submits safe test media,
  receives deterministic OCR output, verifies every line, performs authorised
  pharmacist release, issues the current Quote, selects pickup or delivery,
  accepts the resulting payable Quote, creates one Commercial Order and
  reservation, records payment, completes packing and handoff, and inspects the
  customer-safe, management, Inventory, payment, audit, and usage-meter
  projections.
- The primary seam runs the same lifecycle for web, WhatsApp-ingested, and
  staff-assisted origins by changing only the channel adapter. Domain results
  must be equivalent and duplicate provider events must remain idempotent.
- The primary seam includes full, partial, unavailable, clarification,
  alternative, declined, withdrawn, expired, cancelled, refunded, pickup, fixed
  zone, manual delivery quote, failed delivery, and recovery scenarios.
- The primary seam proves that raw OCR cannot issue a Quote; one unverified line
  blocks progress; an ordinary Manager cannot release professionally; a stale
  release conflicts; and material changes invalidate prior release.
- The primary seam proves that only current, issued, unexpired Quote Versions
  can be accepted; repeated acceptance returns the first Order; changed-payload
  identity reuse fails; and linked Product stock is reserved exactly once.
- The primary seam proves that unavailable Quote outcomes create no Order Line
  or stock movement and that a labelled alternative maps to the approved
  Product Offering shown to the customer.
- The primary seam proves that delivery assignment requires configured
  eligibility, payment policy, packing, and ready state; courier projections
  contain no prescription media, transcription, internal notes, or credentials.
- Security and privacy contract tests cover token digest storage, expiry,
  revocation, rate limiting, tenant/Store isolation, media MIME/signature and
  malware failure, signed-access expiry, retention deletion, log redaction, and
  allowlisted public projections.
- Permission-matrix tests cover customer public access, attendant verification,
  pharmacist release, packing, dispatch, management, finance, privacy/audit,
  owner/admin assignment, expired credential, removed membership, and
  cross-Store denial.
- Provider adapter contract tests use fakes for object storage, media safety,
  OCR, inbound/outbound WhatsApp, hosted payment, and dispatch. They cover
  verified success, duplicate and out-of-order webhook, timeout, definite
  failure, uncertain write, retry, reconciliation, and terminal review.
- WhatsApp isolation tests cover recipient phone-number-id routing, unknown
  recipients, invalid signatures, revoked or rotated credentials, one customer
  contacting multiple pharmacies, a shared group number with missing or
  expired Store context, cross-Tenant Store bindings, duplicate media events,
  and per-WABA template approval failure. Every ambiguous or cross-Tenant case
  fails closed without creating or merging a Prescription Request.
- Browser acceptance tests cover QR channel choice, mobile web upload,
  clearer-image recovery, request acknowledgement, current Quote review,
  labelled partial/alternative outcomes, payment handoff, pickup/delivery
  choice, customer status, and neutral notifications at phone widths.
- Dashboard browser acceptance tests cover the queue, side-by-side media and
  transcription, mandatory line verification, pharmacist release, Quote issue,
  packing, readiness, delivery assignment, exception handling, audit visibility,
  and role-based action availability.
- Accessibility tests cover keyboard navigation, semantic form labels, focus
  after validation errors, image/PDF capture instructions, status announcements,
  colour-independent confidence and outcome states, and readable phone layouts.
- Performance tests cover bounded upload, queue pagination, OCR job throughput,
  service-level timers, Quote issue and acceptance under concurrent stock
  changes, notification fan-out, and reporting over the expected pilot volume.
- Failure-injection acceptance proves that OCR, WhatsApp, payment, storage, or
  dispatch downtime never bypasses verification, pharmacist release, payment
  verification, or fulfilment eligibility.
- Existing prior art is preferred: public Service Request/Quote/tracking token
  flows, versioned Quote acceptance, Commercial Order idempotency and stock
  reservation integration tests, payment/refund ledger tests, provider-neutral
  customer messaging tests, delivery scheduling/reminder tests, tenant
  permission tests, and Storefront service-display/browser patterns.
- Pilot acceptance uses synthetic prescriptions and test catalog data. Real
  patient images or medicine details are never committed to fixtures, snapshots,
  test logs, screenshots, or the commercial workbook.

## Out of Scope

- EwaTrade acting as a pharmacy, medicine seller, prescriber, diagnostic
  service, clinical decision-maker, or dispensing operator.
- Automated diagnosis, prescribing, dosage recommendation, clinical advice,
  prescription validity approval, medicine substitution, Quote release, or
  dispensing without the pharmacy's authorised pharmacist.
- A consumer marketplace that compares or broadcasts one prescription to
  multiple pharmacies.
- Telemedicine, doctor consultation, electronic prescribing by prescribers,
  hospital EMR integration, patient medical records, diagnoses, laboratory
  results, insurance claims, HMO authorisation, or national health identity.
- Hardcoding one General Hospital, a one-kilometre distance, one demand-volume
  claim, NGN 500 as a universal fee, or any single pharmacy's pricing and
  operating policy into the product.
- Universal citywide or long-distance delivery. Each Store must explicitly
  configure and approve service lanes and item eligibility.
- Controlled, restricted, cold-chain, compounded, or otherwise excluded
  medicine delivery until the pharmacy's approved SOP and applicable authority
  make a lane eligible.
- Free-text Commercial Order Lines that bypass Catalog, Product Offering,
  price, Inventory Unit, snapshot, reservation, and fulfilment invariants.
- A full pharmacy POS, procurement, supplier, accounting, or inventory migration
  inside this feature. Prescription Commerce integrates with EwaTrade commerce
  and approved external connectors; broader pharmacy-system adoption is a
  separate programme.
- A customer native app requirement. QR, responsive web, and WhatsApp are the
  launch entry points; an EwaTrade app may consume the same public contracts
  later.
- An autonomous WhatsApp chatbot that interprets prescriptions or issues
  Quotes. WhatsApp is a channel into the controlled pharmacy workflow.
- A permanent shared EwaTrade WhatsApp number representing unrelated pharmacies
  or routing sensitive requests by customer phone number alone.
- A hard dependency on Twilio or another Business Solution Provider inside
  Prescription Operations. Provider choice remains behind Communications.
- Customer live-map courier tracking, route optimisation, courier bidding,
  fleet payroll, or a complete dispatch marketplace in the first pilot.
- Guaranteed OCR accuracy. The product guarantees a mandatory verification
  process, not perfect machine transcription.
- Permanent retention or public publication of prescription images.
- Production launch before PCN/electronic-pharmacy, privacy, media, processor,
  payment, delivery, and incident-response gates are approved.
- Hardcoded EwaTrade pricing, conversion targets, revenue forecasts, or pharmacy
  ROI. Commercial model values remain validation hypotheses and contract data.

## Further Notes

- This specification implements the accepted Prescription Commerce product and
  operating boundary: the pharmacy owns the professional and commercial act;
  EwaTrade owns the workflow technology.
- The hospital-adjacent pharmacy is the recommended first design partner and
  active-test location, not the permanent market definition.
- The current codebase already supplies the most valuable primitives: public
  opaque-token access, request/quote patterns, immutable Quote acceptance,
  Commercial Orders, exact stock availability and reservation, payment/refund
  facts, notification intent and provider attempts, delivery commitments, role
  checks, idempotent commands, and customer-safe projections.
- The largest new production dependencies are managed private prescription
  media, trusted media safety, OCR processing, Store-scoped professional
  assignments, a prescription-specific request/review aggregate, inbound
  pharmacy WhatsApp, Commerce-owned generic Quotes, Store delivery zones, and
  fulfilment execution.
- The existing commercial package remains the source for positioning, feature
  catalogue, pricing hypotheses, pilot metrics, research inputs, and external
  pharmacy communication. Financial values and KPI targets in that package are
  hypotheses until pharmacy baseline and controlled pilot evidence replace
  them.
- The local issue-tracker publication for this PRD is this specification with
  `Label: ready-for-agent` and `Status: ready-for-agent`. No GitHub issue or
  external tracker action is required.
