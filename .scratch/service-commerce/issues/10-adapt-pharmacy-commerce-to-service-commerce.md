# 10 - Adapt Pharmacy Commerce To Service Commerce

**What to build:** Move Pharmacy Commerce onto the approved shared channel, Quote/payment, action and fulfilment seams without weakening or renaming away its regulated source aggregate and operating gates.

**Blocked by:** 03 - Establish Customer Request Interoperability Contract; 04 - Generalize WhatsApp Connection And Location Binding; 05 - Deliver Channel-Neutral Request Intake; 06 - Reuse Quote Payment And Order Conversion; 08 - Extract Shared Pickup And Delivery Fulfilment; 09 - Deliver State-Aware Customer Actions And Notifications; 11 - Enforce Vertical And Jurisdiction Eligibility.

**Status:** approved; blocked

**Approval:** Owner-approved on 2026-08-09. Start only after every listed blocker is complete.

- [ ] Keep `PrescriptionRequest`, private media, safety/OCR, transcription revisions, attendant verification and pharmacist release authoritative in Pharmacy Commerce.
- [ ] Preserve credentialed professional roles, audited confirmation, inventory-backed mapping, retention, incident and personal break-glass rules.
- [ ] Route web, staff and technically eligible WhatsApp origins through shared adapters without merging customer threads or prescription content.
- [ ] Use shared Quote/payment/pickup/delivery/actions only after the pharmacist/source adapter returns the required release and policy facts.
- [ ] Preserve every completed Prescription Commerce compatibility and Neon acceptance test; completed tickets remain historical evidence.
- [ ] Keep Pharmacy WhatsApp disabled when Meta policy, jurisdiction, legal, licence, template or operating approval is absent, regardless of technical connection readiness.
- [ ] Provide a staged switch and rollback; no prescription-named persistence contraction occurs in this ticket.
- [ ] Re-run authenticated desktop/mobile browser QA and customer-safe public projections after adaptation.
