# Prescription Commerce

## Status

The source implementation for tickets 01-19 and the source/runbook portion of
ticket 20 were completed on 2026-08-09 using the Midday migration contract at
`.scratch/prescription-commerce/midday-migration-contract.md`. It includes the
dashboard workspace, public intake and capability routes, clinical review,
versioned Commerce Quotes, hosted payments, pickup and delivery operations,
direct Meta WhatsApp onboarding/routing, privacy controls, reporting, and
durable jobs. Production launch remains conditional on schema deployment and
the discovery, authority, privacy, media, provider, template, canary, and
operating gates below. The hospital-adjacent pharmacy remains the proposed
first design partner, not the product boundary.

The Neon development schema was synchronized on 2026-08-09 without Docker or a
destructive reset. An authenticated disposable pharmacy completed policy and
role setup, activation, staff-assisted intake, explicit success/review routing,
and desktop/mobile global-sheet QA. A separate disposable Neon fixture now
proves web, staff-assisted, and WhatsApp safe-media origins through
deterministic safety/OCR, human verification, pharmacist release,
inventory-backed Quote, idempotent pickup acceptance, hosted-payment
callback/replay, and secure pickup handoff. Focused
communications/database/job tests prove independent pharmacy senders,
`phone_number_id` routing, central-number branch selection, and same-customer
Tenant/Store isolation. Live Meta, Paystack, private-media/OCR, cross-channel
delivery parity, load/security, production backfill, and production schema
rollout remain open gates.

Deterministic failure injection covers private-storage unavailability, OCR
timeout/unavailability, Meta media/send failure, failed payment and duplicate
callback handling, structured delivery failure, stale quick actions, and
Tenant-scoped credential revocation. These source tests do not replace live
provider canaries.

## Product Definition

Prescription Commerce is a pharmacy-owned digital operating layer for intake,
transcription assistance, professional verification, quotation, payment,
pickup, and eligible delivery. Demand may arrive through QR codes, a responsive
web link, the pharmacy's WhatsApp chat, an eventual app, staff-assisted intake,
hospital or clinic referrals, doctors, diagnostics, pharmacy channels, or
repeat-care workflows.

The licensed pharmacy remains the medicine seller, clinical authority, and
dispensing operator. EwaTrade provides workflow technology, communications,
order and payment orchestration, fulfilment coordination, reporting, and an
integration path to the broader EwaTrade commerce platform.

## Customer Flow

1. A public QR code or shared link opens a channel selector without embedding
   patient data.
2. The customer chooses `Continue online` or `Continue on WhatsApp`. WhatsApp
   opens the pharmacy's configured chat through the existing provider-neutral
   messaging direction.
3. The customer submits a prescription image or PDF, contact details, demand
   source, and initial fulfilment preference.
4. Image-quality controls request a clearer source when needed. OCR creates an
   editable transcription with confidence indicators.
5. An attendant compares the generated output with the original and confirms
   or corrects every line. The request cannot proceed on raw OCR output.
6. A licensed pharmacist resolves ambiguity, prescription validity, restricted
   items, permitted alternatives, availability, price, and final release.
7. The customer receives a versioned quote and selects one fulfilment route
   before payment whenever the route changes the fee, promise, or eligibility:
   - pickup, with packing and a ready notification; or
   - delivery, using a pharmacy-configured service zone. The initial
     hospital/campus pilot example is NGN 500; other locations are calculated
     or manually confirmed.
8. After the exact current total is fixed, the customer accepts the current
   quote, pays through provider-hosted checkout or an authorised recorded
   method, and receives status, readiness, delivery, and resolution updates.

## Product Capabilities

- Customer: QR, web link, WhatsApp, mobile capture, image/PDF upload, consent,
  contact, status page, and notifications.
- Transcription: image-quality checks, OCR draft, confidence indicators,
  mandatory line verification, corrections, timestamps, reviewer identity,
  and controlled original-image access.
- Pharmacy: clarification queue, prescription and restricted-item gates,
  substitution controls, pharmacist approval, quote release, and exception
  reasons.
- Commerce: full/partial/unavailable states, itemised and versioned quotes,
  acceptance, payment, receipt, reconciliation, cancellation, and refunds.
- Fulfilment: packing, ready status, pickup code, authorised collection,
  configurable delivery zones, eligibility, courier assignment, tracking,
  proof, failure handling, and service recovery.
- Operations: role-based inbox, ownership, service-level timers, templates,
  escalation, branch configuration, audit history, and POS/inventory/accounting
  integration path.
- Analytics: request source, availability, quote time, quote-to-paid
  conversion, delivery choice, ready-on-promise, workload, error, revenue, and
  service reliability.

## AI And Safety Boundary

- OCR is a transcription assistant only. It cannot diagnose, prescribe,
  substitute, price, approve, dispense, charge, or release an order.
- The original prescription remains visible during verification.
- Every line requires an explicit attendant review before pharmacist release.
- The pharmacist remains the professional release gate.
- Original output, corrections, reviewer identity, and timestamps form the
  audit history.
- The attendant workspace shows original pages beside the draft, creates a new
  revision for corrections/additions/deletions, and exposes history to the
  pharmacist. Pharmacist mappings explicitly capture alternatives and
  customer-visible wording.
- Safety, privacy, or pharmacy-error incidents are rollout-stopping
  guardrails, irrespective of commercial conversion.

## WhatsApp Channel Architecture

- The pharmacy or pharmacy group owns its WhatsApp Business Account and public
  business number. A shared EwaTrade number is not the permanent identity for
  unrelated pharmacies.
- The first pilot may manually connect one pharmacy-owned number. Repeatable
  onboarding uses Meta Embedded Signup directly or through an approved Business
  Solution Provider.
- The initial adapter follows Midday's direct Meta WhatsApp Cloud API transport
  pattern. Midday does not use Twilio for WhatsApp, and its single global sender
  configuration is not copied as EwaTrade's Tenant model.
- EwaTrade operates one Meta application and verified webhook surface. The
  recipient provider phone-number id resolves one Tenant-owned WhatsApp
  Connection before Store, customer, or request resolution.
- Store Prescription Channels bind to a reusable Tenant WhatsApp Connection. A
  central pharmacy-group number may bind several Stores only when bounded
  channel context or explicit customer choice resolves the Store; ambiguity
  fails closed.
- Conversation state keys combine connection, customer WhatsApp id, and an
  explicit Store context. A separate short-lived routing pointer remembers the
  last explicit Store selection for central-number follow-up media/text without
  carrying a request id or content; a new channel token safely switches it.
  Customer phone number alone never merges pharmacy threads.
- Credentials are encrypted or stored through managed-secret references.
  Template approvals, provider state, Store bindings, and billing ownership are
  durable per connection/WABA facts.
- WhatsApp quick actions use opaque, idempotent payloads. `Pick up`, `Delivery`,
  and `Ask pharmacy` resolve fulfilment first; `Review & pay` appears only after
  the exact payable Quote is fixed and opens scoped EwaTrade and hosted-checkout
  surfaces. Durable action rows store a digest of the short-lived public
  capability and the internal Quote Version id; raw Quote/action bearer tokens
  are never stored as action entity identifiers. Public Quote, fulfilment, and
  checkout commands resolve either capability to the same Store-scoped current
  Quote Version and revalidate its state.
- Meta usage, optional provider surcharge, number/sender fees, and EwaTrade
  support are metered separately. Volatile provider rates are not domain
  constants or hidden medicine-price adjustments.
- Meta `sent`, `delivered`, `read`, and `failed` receipts update the scoped
  communication attempt idempotently; they never enter Prescription intake.

## Midday Dashboard Conformance

- The route is a server composition/prefetch boundary. Typed `nuqs` loaders and
  hooks share assignee/date/status/source filters, sort, selected-request, and
  explicit intake/media/attendant/pharmacist/quote/success sheet modes across
  refreshes.
- The always-mounted Prescription Request sheet is owned by `GlobalSheets`, and
  the feature page composes only the header, queue, and fulfilment panels.
- The header shows current Store activation/readiness. Actionable rows open the
  matching state controller and fail closed after a stale state transition.
  Pharmacist release, clarification, and decline require a visible revisioned
  confirmation before the separate server command runs.
- Staff intake, Store settings, and professional-role forms reuse Zod field
  contracts from the Prescription package. Quote command derivation also lives
  in that package rather than the dashboard component.

## Implemented Pharmacy Onboarding

1. An Owner or Admin configures the Store prescription policy, pickup and
   delivery rules, retention, and verified attendant/pharmacist assignments.
2. The pharmacy connects its own WABA through manual setup or Meta Embedded
   Signup. Embedded Signup validates encrypted callback state, discovers
   authorized numbers, and requires explicit number and test-recipient
   selection; it never guesses the first number.
3. EwaTrade stores the credential as an encrypted server-side reference,
   persists the Tenant connection, and creates a pending Store binding.
4. An identifier-only durable readiness job verifies the credential, number,
   webhook, templates, billing owner, and neutral test message. A replacement
   never displaces the working sender until this check passes.
5. Passing readiness activates the binding and suspends the replaced binding.
   Failed replacement or credential rotation leaves current routing intact.
6. The Store can activate its private web/staff workflow after pharmacy policy,
   fulfilment, and professional-role gates pass. WhatsApp remains unavailable
   until its separate connection readiness passes; only then does the public
   WhatsApp link use the active Store-bound sender and opaque Store context.

Central group numbers may bind multiple Stores, but every new conversation
must carry an opaque Store channel context or an explicit Store choice. Unknown
or ambiguous routing is rejected before message content is persisted.

## Commercial Model To Validate

The recommended architecture combines:

- one-time implementation and configuration;
- recurring branch subscription;
- a fixed completed-prescription-order fee;
- optional delivery coordination margin; and
- separately priced premium integrations, analytics, support, messaging, and
  multi-branch services.

The working ranges and model outputs in the commercialization package are
hypotheses. They must be replaced with pharmacy baseline data, willingness-to-
pay evidence, and controlled pilot performance before pricing approval.

## Pilot Decision Framework

Primary outcome hypotheses:

- quote-to-paid conversion at or above 50%;
- median quotation turnaround at or below ten minutes; and
- ready-on-promise at or above 95%.

Drivers include image clarification, OCR line correction, full availability,
delivery selection, staff minutes, source mix, basket value, and abandonment.
Guardrails are zero safety incidents, privacy incidents, and pharmacy errors.

Pilot reporting must be de-identified. The commercial workbook must not store
patient names, phone numbers, prescription images, diagnoses, medicine details,
or other clinical content.

Operational reporting is available for one Store or all Tenant Stores. Quote
outcomes, channel mix, conversion, payment, pickup, delivery, review time, and
Store breakdowns derive from canonical lifecycle facts. EwaTrade charges,
Meta costs, provider fees, delivery costs, tax, and pharmacy revenue stay
separate; missing provider amounts render as unknown.
Report Store scope is URL-owned/shareable. Issuance, acceptance, payment,
pickup handoff, and delivery completion are counted by authoritative occurrence
time in the half-open report window, not record creation time.

Retention independently covers clinical artifacts, audit evidence, and
commercial identity. Sensitive reads are purpose-audited. Break-glass access
is personal, visible, limited to 60 minutes, does not bypass pharmacist release,
and cannot be resolved without a post-use review.

## Production Readiness Dependencies

- Confirm the PCN/electronic-pharmacy role and licence pathway with the
  pharmacy, regulator guidance, and counsel.
- Document privacy controller/processor responsibilities, lawful basis,
  consent where required, retention, access, deletion, incident response, and
  subprocessor terms.
- Select managed private prescription-media storage, signed/time-limited
  access, encryption, least privilege, malware controls, audit logs, backup,
  and recovery.
- Select the OCR provider and approve processor terms, confidence metadata,
  failure handling, and cost controls.
- Validate each pharmacy-owned WABA/number, the implemented direct Meta Cloud
  API and Embedded Signup flow, credential lifecycle, templates, billing
  ownership, webhook subscription, inbound media, and neutral test recipient
  in a provider canary. The code is complete but no live Meta connection is
  claimed.
- Approve delivery SOPs and exclusions for restricted, controlled, cold-chain,
  or clinically unsuitable items.
- Define roles, request states, service levels, refunds, partial fulfilment,
  cancellation, escalation, and downtime fallback.

## Commercialization Artifacts

- `output/commercialization/ewatrade-prescription-commerce-commercialization-strategy.md`
- `output/pdf/ewatrade-prescription-commerce-commercialization-strategy.pdf`
- `output/pdf/ewatrade-prescription-commerce-pharmacy-partnership.pdf`
- `output/pdf/ewatrade-prescription-commerce-mobile-pitch.pdf`
- `outputs/ewatrade-prescription-commerce-commercialization/ewatrade-prescription-commerce-commercial-model.xlsx`

## Implementation Specification

- `.scratch/prescription-commerce/spec.md`
- Label: `implementation-in-review`
- Status: source implemented; external acceptance gates pending
- Primary test seam: Neon-backed domain repository/API lifecycles for web,
  staff-assisted, and WhatsApp safe-media submission through deterministic
  safety/OCR, mandatory attendant verification, pharmacist release, current
  Quote acceptance, Commercial Order/payment, and pickup handoff. The tests
  inspect customer-safe, management, inventory, payment, audit, reporting, and
  usage projections; delivery and live-provider acceptance remain external
  gates.

## Related Product Areas

- `.brain/modules/whatsapp-commerce.md`
- `.brain/features/generic-service-operations.md`
- `.brain/features/commercial-order-delivery-scheduling.md`
- `.brain/features/ewatrade-dispatch-internal-app.md`
- `.brain/decisions/ADR-0026-prescription-commerce-product-and-operating-boundary.md`
- `.brain/decisions/ADR-0027-tenant-owned-multi-pharmacy-whatsapp-connections.md`
