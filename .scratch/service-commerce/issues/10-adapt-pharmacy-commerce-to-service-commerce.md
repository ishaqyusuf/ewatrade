# 10 - Adapt Pharmacy Commerce To Service Commerce

**What to build:** Make Pharmacy a thin regulated source/policy extension of the
single Service Commerce workspace, moving reusable channel, Progressive
Catalog, Quote/payment, action, fulfilment and reporting behavior to shared
seams without weakening its source aggregate and operating gates.

**Blocked by:** 03 - Establish Customer Request Interoperability Contract; 03A —
Grow The Private Catalog From Requests And Quotes; 04 - Generalize WhatsApp
Connection And Location Binding; 04A - Establish Generic Customer Request
Media And Verified Observations; 05 - Deliver Channel-Neutral Request Intake;
06 - Reuse Quote Payment And Order Conversion; 06A — Graduate Progressive
Catalog To Managed Inventory; 06B - Enforce Store Quotation Approval And
Release; 08 - Extract Shared Pickup And Delivery Fulfilment; 09 - Deliver State-
Aware Customer Actions And Notifications; 11 - Enforce Vertical And
Jurisdiction Eligibility.

**Status:** source-complete on 2026-08-11; final production/provider release and
Ticket 13 contraction gates remain open

**Approval:** Original and revised thin-Pharmacy/Progressive Catalog scope
owner-approved on 2026-08-09; generic Customer Channels/media ownership
amendment approved on 2026-08-10.

- [x] Keep `PrescriptionRequest`, the authoritative clinical
  `PrescriptionMedia` record, clinical OCR/transcription revisions, attendant
  verification and pharmacist release in Pharmacy Commerce; generic private
  storage/safety/retry/grants remain owned by Ticket 04A.
- [x] Reuse generic Media Asset transport/storage/grants and typed attachment
  links where compatibility permits, while retaining `PrescriptionMedia` as the
  authoritative clinical record during expand-contract. Pharmacy continues to
  own OCR, original-media comparison, professional access, clinical retention,
  break-glass and release; no generic safety result becomes clinical approval.
- [x] Allow only human-verified lines to link or propose private draft Catalog
  records; OCR alone cannot create/publish medicine, and pharmacist release
  owns any in-stock or procure-to-order commitment.
- [x] Preserve credentialed professional roles, audited confirmation, inventory-backed mapping, retention, incident and personal break-glass rules.
- [x] Route web, staff and technically eligible WhatsApp origins through shared adapters without merging customer threads or prescription content.
- [x] Use shared Quote/payment/pickup/delivery/actions only after the pharmacist/source adapter returns the required release and policy facts.
- [x] Let a pharmacist also receive a generic Store attendant and/or quotation-
  approver assignment without equating those commercial capabilities with
  licence status. Clinical release must precede any applicable commercial Quote
  approval, and neither decision satisfies the other.
- [x] Preserve every completed Prescription Commerce compatibility and Neon acceptance test; completed tickets remain historical evidence.
- [x] Keep Pharmacy WhatsApp disabled when Meta policy, jurisdiction, legal, licence, template or operating approval is absent, regardless of technical connection readiness.
- [x] Provide a staged switch and rollback; no prescription-named persistence contraction occurs in this ticket.
- [x] Verify and retain Ticket 04's WhatsApp connection, Store binding and
  link/QR configuration under `Settings > Channels`; do not implement that
  generic surface again. Move only the remaining Pharmacy roles, consent,
  professional policies and clinical operating controls to the category-
  specific compliance surface, with a compatible redirect from the old
  Prescription settings entry.
- [x] Remove duplicate Pharmacy-facing commerce orchestration from the switch
  target after shared acceptance, while retaining Prescription source,
  professional-review, privacy and policy modules; final deletion remains
  Ticket 13/owner-gated.
- [x] Re-run authenticated desktop/mobile browser QA and customer-safe public projections after adaptation.

## Evidence

- Added a focused Pharmacy source/action adapter. Shared projections require a
  current `RELEASED` pharmacist review whose media and transcript revisions
  match the request; stale, missing and non-released reviews fail closed without
  projecting clinical content. Post-conversion safe actions remain available
  through the shared action projection while the pre-quote source projection
  closes.
- Pharmacy compliance/readiness now derives pickup and delivery from the
  active Tenant/Store-scoped Service Commerce profile. Hidden client values do
  not choose shared outcomes; legacy Prescription flags are used only when no
  shared profile exists, and inactive shared profiles fail closed.
- Moved the regulated setup composition to `Settings > Compliance`, removed
  Customer Channels and commerce-operation setup from that surface, and made
  `/settings/prescriptions` a compatible server redirect. Desktop 1280×720 and
  mobile 390×844 authenticated browser runs rendered the Compliance surface
  without overflow, console errors, generic channel setup or pickup/delivery
  operation configuration.
- Focused final adapter/source/action/fulfilment/settings tests passed 34 tests
  with 71 assertions. The broader affected Pharmacy/shared repository and job
  suites passed 116 tests with 252 assertions. The verified `.env.local` Neon
  compatibility matrix passed 9 tests with 248 assertions across customer
  actions, manual delivery, web/staff/WhatsApp pickup and web/staff/WhatsApp
  fixed delivery. DB and dashboard TypeScript,
  touched-file Biome and diff hygiene passed.
- The compatibility switch is additive. No Prisma schema, migration, production
  data, live Meta provider, Prescription aggregate/public URL or regulated
  persistence was changed. Final compatibility-export deletion remains
  owner-gated in Ticket 13.
