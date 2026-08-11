# EwaTrade Prescription Commerce Commercialization Strategy

Version: 1.0  
Date: August 7, 2026  
Status: Commercial strategy for validation  
Audience: EwaTrade leadership, product, pharmacy partners, and pilot operators

## Executive Summary

EwaTrade Prescription Commerce should be positioned as the digital prescription
sales and fulfilment layer for licensed pharmacies. It enables a pharmacy to
receive prescriptions from QR codes, web links, WhatsApp, hospitals, clinics,
doctors, and existing customers; convert each request into a verified,
pharmacist-approved quotation; collect payment; and fulfil through prepared
pickup or configured delivery.

The first hospital-adjacent pharmacy is a strong pilot wedge, but it is not the
market definition. The product should serve nearby hospitals, distant hospitals,
private clinics, diagnostic centres, chronic-care customers, institutional
referrals, and any pharmacy-owned digital channel.

The licensed pharmacy remains the seller, dispensing operator, and clinical
decision-maker. EwaTrade supplies the intake, workflow, OCR assistance,
commercial order, payment, communication, reporting, and delivery coordination
technology.

The recommended EwaTrade business model is hybrid:

1. one-time onboarding and implementation fee;
2. monthly subscription per branch;
3. fixed fee per completed prescription order;
4. delivery coordination margin when EwaTrade dispatch is used; and
5. premium charges for high usage, multi-branch management, and integrations.

All prices and financial outputs in this package are hypotheses. The first pilot
must replace them with observed request volume, conversion, basket value,
pharmacy margin, staff effort, infrastructure cost, and willingness-to-pay data.

## Product Positioning

### Category

Prescription commerce and fulfilment infrastructure for pharmacies.

### One-line proposition

Turn every prescription request into a safe, trackable digital order.

### Pharmacy-facing proposition

Receive prescriptions from anywhere, verify them safely, quote faster, collect
payment, prepare orders before arrival, and coordinate delivery from one work
queue.

### Customer-facing proposition

Send your prescription, receive a pharmacist-approved quotation, pay, and
choose pickup or delivery without unnecessary pharmacy visits.

### What the product is not

- It is not a prescriber, diagnostic tool, or autonomous dispensing system.
- OCR does not make clinical decisions or release quotations.
- EwaTrade does not replace the licensed pharmacy or responsible pharmacist.
- It is not limited to one hospital, one branch, or one delivery radius.
- It is not a medicine marketplace in the initial wedge.

## Target Buyers And Users

### Economic buyer

The pharmacy owner, managing director, chief operating officer, or head of
digital/retail operations. This person owns revenue growth, branch performance,
customer experience, operating cost, and compliance exposure.

### Operational champions

- Superintendent or lead pharmacist
- Branch manager
- Pharmacy operations manager
- Customer service supervisor
- Dispatch or logistics coordinator
- Finance and reconciliation lead

### Daily users

- Prescription intake attendants
- Licensed pharmacists
- Cashiers and packers
- Dispatch coordinators and riders
- Customers, patients, and caregivers

## Jobs To Be Done

### Pharmacy jobs

- Capture prescription demand before the customer visits another pharmacy.
- Reduce repetitive WhatsApp, phone, paper, and walk-in coordination.
- Turn prescription images into structured work without surrendering control.
- Confirm stock, price, and partial availability quickly.
- Preserve pharmacist review and a complete audit trail.
- Collect payment before packing or delivery where appropriate.
- Prepare pickup orders before customers arrive.
- Coordinate service zones, dispatch, proof, and exceptions.
- Measure request volume, response time, conversion, stock-outs, and revenue.
- Connect prescription demand to EwaTrade POS, inventory, accounting, and
  customer operations.

### Customer jobs

- Avoid travelling merely to discover availability or price.
- Know which items are available before paying.
- Ask a pharmacist a question when clarification is required.
- Select only available or desired items from an itemised quote.
- Pay securely and receive a receipt.
- Choose prepared pickup or delivery to a supported location.
- Know when the order is ready, dispatched, delayed, or delivered.

## Distribution And Demand Sources

The platform should accept prescription requests through pharmacy-controlled
entry points:

- pharmacy QR codes;
- hospital or clinic-specific QR codes;
- secure public web links;
- the pharmacy's WhatsApp conversation;
- the pharmacy website and social profiles;
- EwaTrade storefronts and the future EwaTrade customer app;
- referral links for doctors, clinics, diagnostic centres, and care providers;
- repeat-customer and authorised chronic-care programmes; and
- staff-assisted intake for phone or walk-in requests.

Each entry point should carry non-sensitive source attribution so the pharmacy
can measure which channel or partner generated the request. Patient or
prescription information must never be embedded in the public QR code.

## End-to-End Experience

1. The customer scans a QR code or opens a pharmacy link.
2. The customer continues online or opens the pharmacy's WhatsApp chat.
3. The customer accepts the relevant privacy notice and sends a clear image or
   PDF of the prescription.
4. The platform creates one channel-neutral prescription request.
5. OCR creates an editable transcription draft.
6. An attendant checks every line against the original image. Every line must
   be confirmed individually; uncertainty remains blocked.
7. A licensed pharmacist validates prescription requirements, product mapping,
   quantity, availability, and any permitted alternative.
8. The pharmacy releases an itemised, time-limited quotation.
9. The customer accepts all or selected items and pays through the configured
   payment method.
10. The pharmacy packs the order and the customer chooses prepared pickup or
    delivery.
11. Delivery choices use configured service zones. A hospital may have a fixed
    internal fee while other destinations receive a calculated and confirmed
    charge.
12. The customer receives status updates and the pharmacy closes the request
    with a complete operational and commercial record.

## Complete Feature Catalogue

### Customer intake

- QR, web, WhatsApp, storefront, app, and staff-assisted entry
- Clear-photo guidance and multi-page image/PDF upload
- Phone verification where appropriate
- Privacy notice and consent capture
- Hospital, clinic, branch, campaign, and referral attribution
- Optional patient/caregiver distinction
- Preferred contact channel and language
- Saved address and supported service-zone check
- Clearer-image and missing-information requests
- Accessible low-bandwidth flow without mandatory app installation

### OCR and transcription

- OCR or vision extraction into structured prescription lines
- Medicine name, strength, form, direction, duration, and quantity fields
- Page/line location and confidence metadata where supported
- Original image visible beside extracted lines
- Editable transcription without changing the source image
- Mandatory line-by-line attendant confirmation
- Low-confidence, missing-field, and illegible-image blocking states
- Manual transcription fallback
- Original value, corrected value, reviewer, and timestamp audit history
- Duplicate message/media protection across WhatsApp retries

### Pharmacist review

- Prescription validity checklist
- Prescriber and patient detail review
- Product, variant, and inventory mapping
- Quantity and duration confirmation
- Partial availability handling
- Controlled/restricted medicine exception routing
- Alternative/substitution proposal with explicit pharmacist and customer action
- Pharmacist notes and customer counselling request
- Quote approval, decline, clarification, or escalation
- Licensed reviewer identity and approval timestamp

### Quotation and order

- Itemised available, unavailable, and clarification-required lines
- Quote versions, expiry, taxes/fees, and commercial terms
- Customer selection of all or specific available lines
- Customer acceptance and order conversion
- Immutable commercial snapshots of approved items and prices
- Payment link, recorded payment, balance, receipt, refund, and cancellation
- Cash, transfer, card, POS, or configured provider payment support
- Payment reconciliation and exception queue

### Pickup

- Pack-before-arrival workflow
- Packing checklist and responsible staff member
- Ready-for-pickup status and notification
- Pickup branch, hours, directions, and contact
- Customer or representative collection details
- Pickup verification code or signed confirmation
- Uncollected-order reminders and expiry policy

### Delivery

- Fixed-fee hospital or campus zones
- Distance, zone, branch, or manually confirmed external delivery pricing
- Customer address, landmark, unit/ward, and receiving contact
- Same-day, scheduled, or approved long-distance delivery lanes
- Branch selection based on inventory, location, and operating policy
- Dispatcher/rider assignment and status tracking
- Tamper-evident packing checklist
- Temperature/cold-chain and restricted-item eligibility rules
- Proof of pickup, proof of delivery, failed attempt, and incident reporting
- Customer-safe tracking and delivery notifications

### Pharmacy operations

- Unified work queue for every intake channel
- Priority, ageing, ownership, service-level, and exception views
- Staff roles for attendant, pharmacist, cashier, packer, manager, and admin
- Work assignment, reassignment, escalation, and handover
- Multi-branch routing and central oversight
- Operating hours, service zones, delivery fees, and quote expiry settings
- WhatsApp number and message-template configuration
- POS, inventory, accounting, payment, and dispatch integration
- Customer history and authorised repeat-prescription workflows
- Audit logs, exports, and reconciliation reports

### Management and analytics

- Requests by source, branch, hospital, clinic, campaign, and channel
- First-response and quotation turnaround time
- Quote-to-order and order-to-fulfilment conversion
- Average basket and prescription lines per request
- Full, partial, and unavailable stock outcomes
- Revenue recovered from prescription demand
- Cancellation, refund, clarification, and abandonment reasons
- Pickup versus delivery mix
- On-time readiness and delivery performance
- OCR correction and manual-transcription rates
- Staff workload and service-level performance
- Privacy, safety, packing, and delivery incidents

### Security and governance

- Tenant and branch isolation
- Least-privilege staff access
- Private object storage, malware screening, encryption, and signed access
- Consent, privacy notice, lawful-basis, and processor records
- Configurable retention, deletion, legal hold, and access history
- Controller/processor agreements and vendor inventory
- Incident and breach response workflow
- Audit export for pharmacy, privacy, and regulatory review
- AI provider controls prohibiting secondary training where contractually
  required

## AI And Professional-Control Policy

AI accelerates transcription and queue work. It does not approve care.

- OCR output is always a draft.
- Every extracted line must be verified against the original prescription.
- Low confidence can increase attention; high confidence can never bypass
  review.
- An attendant may correct transcription but cannot release a clinical quote.
- A licensed pharmacist must review and release the quotation.
- The platform must not automatically substitute, diagnose, prescribe,
  dispense, charge, or promise availability from OCR alone.
- Every correction and approval must be attributable and time-stamped.

## Competitive Position

Online prescription upload, WhatsApp ordering, pharmacist review, and delivery
already exist in Nigeria. That validates customer behaviour, but it is not the
EwaTrade advantage.

EwaTrade's proposed advantage is pharmacy-owned prescription commerce:

- the pharmacy keeps its brand, customer, inventory, and commercial control;
- web and WhatsApp requests enter one structured operations queue;
- OCR is paired with mandatory human verification;
- prescription demand connects to POS, inventory, payments, accounting, and
  delivery rather than stopping at chat;
- branches can attribute demand to hospitals, clinics, campaigns, and service
  zones; and
- the same operating layer can support one branch or a multi-branch network.

## Go-To-Market Strategy

### Initial wedge

Begin with one high-volume licensed pharmacy that already receives substantial
prescription demand and has a motivated owner, pharmacist lead, attendants, and
dispatch capacity.

The pilot should solve one complete job: receive, verify, quote, pay, and fulfil
prescriptions from web and WhatsApp in one queue.

### Acquisition motion

1. Founder-led sale to the pharmacy owner or managing director.
2. Workflow observation and baseline measurement.
3. Fixed-duration operational pilot with named site leads.
4. Weekly operating review with conversion, turnaround, availability, and
   incident data.
5. Commercial conversion to branch subscription and usage pricing.
6. Expansion to other branches and pharmacy-controlled referral sources.

### Expansion sequence

1. More prescription sources for the same branch.
2. More branches for the same pharmacy group.
3. Inventory-aware branch routing and central operations.
4. EwaTrade dispatch and configured service zones.
5. Deeper POS, accounting, procurement, and customer-retention integration.
6. Additional licensed pharmacy partners only after the single-pharmacy model
   is operationally repeatable and the regulatory role is confirmed.

## EwaTrade Business Model

### Recommended model

Use a hybrid model with predictable recurring revenue and aligned transaction
upside.

#### One-time implementation

Charge for branch setup, workflow configuration, pharmacy branding, QR/source
setup, staff training, service zones, and initial integration.

#### Monthly branch subscription

Charge for the request queue, staff workspaces, pharmacist controls,
notifications, reporting, configured usage allowance, and support.

#### Completed-order fee

Charge a fixed fee for each prescription request that becomes a paid order. A
fixed amount is easier to explain and reconcile during the pilot than a
percentage of medicine value.

#### Delivery coordination margin

When EwaTrade dispatch is used, retain an agreed margin from the customer-paid
delivery fee after courier settlement. Pharmacy-owned delivery can remain
outside this margin or carry only a software coordination charge.

#### Premium usage and integrations

Charge separately for excess OCR/messaging volume, additional branches,
central operations, advanced analytics, custom service zones, dedicated
support, and POS/accounting/API integrations.

### Pricing hypotheses for testing

These are test ranges, not approved prices:

| Component | Initial hypothesis |
| --- | ---: |
| Implementation per branch | NGN 250,000 to NGN 750,000 |
| Monthly platform subscription | NGN 100,000 to NGN 300,000 |
| Completed prescription order | NGN 100 to NGN 300 |
| EwaTrade delivery margin | 10% to 20% of customer delivery fee |
| Custom integration | Scoped and quoted separately |

The workbook in this package makes every assumption editable and shows
conservative, base, and growth cases.

### Revenue to defer

- Paid medicine promotion or prescription-line advertising
- Patient data monetisation
- Automated product substitution incentives
- Marketplace commissions across multiple pharmacies before the regulatory
  aggregator role is confirmed

These paths create trust, conflict-of-interest, or regulatory risk and should
not fund the initial model.

## Pilot Design

### Duration

Two weeks of setup and baseline measurement, followed by 14 to 30 days of live
operation.

### Included scope

- one licensed pharmacy and one initial branch;
- secure web and pharmacy WhatsApp intake;
- prescription photo/PDF handling;
- OCR draft and mandatory attendant verification;
- pharmacist review and quotation;
- payment recording/link;
- prepared pickup and configured delivery choices;
- notifications, audit history, and pilot reporting; and
- manual fallbacks for every critical automated step.

### Excluded until approved

- autonomous clinical decisions;
- automatic substitution;
- controlled/restricted medicine remote fulfilment without approved policy;
- cross-pharmacy marketplace routing;
- nationwide delivery promises without item, courier, and storage eligibility;
- patient-data reuse outside the stated request purpose; and
- production scale before privacy, storage, security, and pharmacy approvals.

## KPI Framework

Targets are provisional decision gates, not market benchmarks.

### Primary outcomes

| KPI | Definition | Provisional pilot gate |
| --- | --- | ---: |
| Quote-to-paid conversion | Paid prescription orders / valid quotations issued | 50% or higher |
| Median quotation turnaround | Median minutes from valid request to released quote | Below 10 minutes |
| Ready-on-promise rate | Orders ready by promised pickup/delivery handoff time / due orders | 95% or higher |

### Driver metrics

- valid requests reaching OCR/transcription review;
- requests requiring a clearer image;
- OCR lines corrected by an attendant;
- requests fully available, partially available, or unavailable;
- pharmacist clarification rate;
- payment completion rate;
- delivery selection rate; and
- requests handled per staff hour.

### Guardrails

- safety incidents: zero;
- privacy or unauthorised-access incidents: zero;
- dispensing or packing errors: zero;
- unreviewed OCR lines reaching quotation: zero;
- refunds/cancellations caused by pharmacy error: tracked and investigated; and
- unsupported delivery or cold-chain exceptions: zero.

## Data Collection Plan

### Baseline before launch

- prescription requests by day and hour;
- current intake channel;
- quotation time and staff handling time;
- pharmacy visits made only to check availability or price;
- average prescription lines and basket value;
- full, partial, and unavailable stock outcomes;
- customer abandonment and lost-sale reasons;
- pickup waiting time;
- delivery demand, fee, cost, distance, and completion time; and
- current staff, shift, device, internet, POS, inventory, and WhatsApp setup.

### During the pilot

Capture one row per request with anonymous request ID, source, channel,
timestamps, line counts, OCR review outcome, pharmacist outcome, availability,
quote value, selected items, payment, fulfilment choice, delivery fee, promise,
completion, exceptions, and customer outcome.

Do not place patient names, diagnoses, prescription images, medicine details,
or phone numbers in the commercial analysis workbook. The workbook is an
administrative measurement tool, not a clinical record.

### Research interviews

- pharmacy owner or managing director;
- superintendent/lead pharmacist;
- branch manager;
- three to five attendants/cashiers/packers;
- dispatch coordinator and riders;
- ten to twenty customers/caregivers across pickup and delivery needs; and
- finance, privacy, security, and integration owners.

## Regulatory And Privacy Readiness

Nigeria's Electronic Pharmacy Regulations 2026 establish the current framework
for registration/licensing, prescription management, medicines supply and
distribution, data privacy/security, and monitoring of electronic pharmacy
services. The exact role of the pharmacy, EwaTrade, and any future multi-pharmacy
aggregation must be confirmed with the Pharmacy Council of Nigeria and qualified
legal counsel before launch.

Prescription images and health information are sensitive personal data under
Nigeria's data-protection framework. Before production processing, the parties
must document controller/processor roles, lawful basis, privacy notice,
processor contracts, access controls, retention, security, incident response,
and any required impact assessment or registration.

This package is a product and commercial strategy, not legal advice.

## Key Risks And Mitigations

| Risk | Mitigation |
| --- | --- |
| Product treated as an unlicensed pharmacy/aggregator | Keep the licensed pharmacy as seller/operator; obtain PCN role confirmation before launch or expansion |
| OCR error becomes a dispensing error | Mandatory line-by-line attendant confirmation and pharmacist release gate |
| WhatsApp and OCR vendors expand data exposure | Consent, DPIA, processor contracts, no-training terms, minimum data, and channel-neutral secure storage |
| Stock data is unreliable | Allow staff confirmation during pilot; measure stock mismatch before deeper inventory automation |
| Staff queue becomes a new bottleneck | Ownership, ageing, escalation, staffing plan, and turnaround reporting |
| Delivery damages medicines or breaks temperature rules | Item eligibility, packing SOP, approved courier lanes, proof, and incident workflow |
| Attractive volume but weak EwaTrade margin | Formula-driven unit economics, usage limits, branch minimum, and pricing review after pilot |
| One anchor customer drives the entire roadmap | Build reusable pharmacy capabilities and validate a second branch/source after the first workflow stabilises |

## Roadmap

### Phase 0: Commercial and compliance readiness, 2 to 4 weeks

- confirm buyer, site leads, pilot scope, and decision rights;
- capture baseline data and observe the current workflow;
- confirm PCN, privacy, WhatsApp, OCR, storage, payment, and delivery roles;
- agree provisional pricing and post-pilot decision gates; and
- sign pilot responsibilities and data-processing terms.

### Phase 1: Controlled pilot, 14 to 30 live days

- launch web and WhatsApp intake into one staff queue;
- operate OCR with mandatory verification;
- issue pharmacist-approved quotations;
- support prepared pickup and configured delivery;
- review metrics and incidents daily; and
- run weekly owner/pharmacist/EwaTrade operating reviews.

### Phase 2: Operational product, 1 to 3 months after pilot

- harden roles, notifications, exceptions, reconciliation, reporting, and
  managed prescription storage;
- connect approved EwaTrade order, payment, inventory, customer, and delivery
  primitives;
- convert the branch to commercial subscription and usage pricing; and
- validate repeat usage and branch-level unit economics.

### Phase 3: Pharmacy group expansion, 3 to 6 months

- add branches, central oversight, source attribution, inventory-aware routing,
  and shared operating policies;
- standardise onboarding, training, service zones, support, and commercial
  terms; and
- test the second independent pharmacy only after repeatability is demonstrated.

### Phase 4: Network strategy, after regulatory and economic proof

- decide whether EwaTrade remains a pharmacy SaaS/operations layer or adds a
  licensed aggregation model;
- introduce approved referral networks, institutional partnerships, and deeper
  dispatch integration; and
- build only the network effects supported by signed partners, compliant roles,
  and positive unit economics.

## Decision Gates

Proceed from pilot to paid production only if:

- the pharmacy leadership and pharmacist lead want continued use;
- staff can operate the workflow without unsafe shortcuts;
- conversion and recovered margin justify pharmacy fees;
- EwaTrade gross contribution is positive or has a credible volume path;
- readiness and delivery performance meet the agreed threshold;
- no unresolved safety, privacy, or regulatory issue remains; and
- the workflow is reusable beyond the original hospital case.

## Evidence And Source Notes

### Validated category behaviour

- Drugstore.ng offers prescription upload, pharmacist chat, pharmacy
  aggregation, WhatsApp ordering, and nationwide delivery:
  https://drugstore.ng/
- Sanlive Pharmacy accepts prescription images/PDFs, requires licensed
  pharmacist review, and offers delivery:
  https://sanlivepharmacy.com/upload/prescription
- Amkamed accepts prescriptions by WhatsApp, uses pharmacist review, and
  advertises nationwide delivery through logistics partners:
  https://www.amkamed.com/our-services

These examples validate channel behaviour, not EwaTrade demand, pricing, or
conversion.

### Official regulatory sources

- Pharmacy Council of Nigeria, Electronic Pharmacy Regulations 2026:
  https://pcn.gov.ng/wp-content/uploads/2026/04/Electronic-Pharmacy-Regulation-2026-B81-108.pdf
- Pharmacy Council of Nigeria publications:
  https://pcn.gov.ng/about-pharmacy-council-nigeria/publications/
- Nigeria Data Protection Act 2023:
  https://ndpc.gov.ng/wp-content/uploads/2024/03/Nigeria_Data_Protection_Act_2023.pdf

### EwaTrade implementation context

- Existing foundations include public requests, versioned quotations,
  commercial orders, payments, stock visibility, customer communication, and
  delivery primitives.
- Managed private object storage and a prescription-grade media safety pipeline
  are not yet selected.
- Existing EwaTrade WhatsApp support is outbound provider-neutral messaging;
  inbound prescription handling requires a dedicated integration boundary.

### Unvalidated hypotheses

- customer and request volume;
- conversion and basket value;
- pharmacy gross margin and recovered sales;
- willingness to pay;
- staff time saved;
- OCR accuracy on actual handwritten prescriptions;
- pickup/delivery mix;
- courier economics; and
- the final licensing and role structure for EwaTrade.

