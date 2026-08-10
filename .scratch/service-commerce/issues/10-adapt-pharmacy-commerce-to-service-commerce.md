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
Catalog To Managed Inventory; 08 - Extract Shared Pickup And Delivery
Fulfilment; 09 - Deliver State-Aware Customer Actions And Notifications; 11 -
Enforce Vertical And Jurisdiction Eligibility.

**Status:** approved; blocked by Tickets 03A, 04, 04A, 05, 06, 06A, 08, and 09

**Approval:** Original and revised thin-Pharmacy/Progressive Catalog scope
owner-approved on 2026-08-09; generic Customer Channels/media ownership
amendment approved on 2026-08-10.

- [ ] Keep `PrescriptionRequest`, the authoritative clinical
  `PrescriptionMedia` record, clinical OCR/transcription revisions, attendant
  verification and pharmacist release in Pharmacy Commerce; generic private
  storage/safety/retry/grants remain owned by Ticket 04A.
- [ ] Reuse generic Media Asset transport/storage/grants and typed attachment
  links where compatibility permits, while retaining `PrescriptionMedia` as the
  authoritative clinical record during expand-contract. Pharmacy continues to
  own OCR, original-media comparison, professional access, clinical retention,
  break-glass and release; no generic safety result becomes clinical approval.
- [ ] Allow only human-verified lines to link or propose private draft Catalog
  records; OCR alone cannot create/publish medicine, and pharmacist release
  owns any in-stock or procure-to-order commitment.
- [ ] Preserve credentialed professional roles, audited confirmation, inventory-backed mapping, retention, incident and personal break-glass rules.
- [ ] Route web, staff and technically eligible WhatsApp origins through shared adapters without merging customer threads or prescription content.
- [ ] Use shared Quote/payment/pickup/delivery/actions only after the pharmacist/source adapter returns the required release and policy facts.
- [ ] Preserve every completed Prescription Commerce compatibility and Neon acceptance test; completed tickets remain historical evidence.
- [ ] Keep Pharmacy WhatsApp disabled when Meta policy, jurisdiction, legal, licence, template or operating approval is absent, regardless of technical connection readiness.
- [ ] Provide a staged switch and rollback; no prescription-named persistence contraction occurs in this ticket.
- [ ] Verify and retain Ticket 04's WhatsApp connection, Store binding and
  link/QR configuration under `Settings > Channels`; do not implement that
  generic surface again. Move only the remaining Pharmacy roles, consent,
  professional policies and clinical operating controls to the category-
  specific compliance surface, with a compatible redirect from the old
  Prescription settings entry.
- [ ] Remove duplicate Pharmacy-facing commerce orchestration from the switch
  target after shared acceptance, while retaining Prescription source,
  professional-review, privacy and policy modules; final deletion remains
  Ticket 13/owner-gated.
- [ ] Re-run authenticated desktop/mobile browser QA and customer-safe public projections after adaptation.
