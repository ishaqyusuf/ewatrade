# 05 - Deliver Channel-Neutral Request Intake

**What to build:** Route web, staff-assisted and WhatsApp customer intent through one channel contract into the correct source aggregate, with explicit origin/actor attribution and identical idempotency guarantees.

**Blocked by:** 03 - Establish Customer Request Interoperability Contract; 03A —
Grow The Private Catalog From Requests And Quotes; 04 - Generalize WhatsApp
Connection And Location Binding; 04A - Establish Generic Customer Request
Media And Verified Observations; 11 - Enforce Vertical And Jurisdiction
Eligibility.

**Status:** in progress; blockers complete. The shared envelope, protected
dispatcher, public web Product-inquiry page, staff procedure and explicit
product-selected generic WhatsApp/image-document adapter are source-complete.
The complete origin/source/media isolation matrix and authenticated browser
acceptance remain open.

**Approval:** Original and revised Progressive Catalog intake scope
owner-approved on 2026-08-09; use of the Ticket 04 stable entry point and the
generic attachment scope approved on 2026-08-10.

- [x] Define shared intake envelope fields for channel, opaque Store context, client/provider idempotency, consent/opt-in facts and source-specific payload.
- [x] Resolve Tenant, Store, capability, source adapter and authorization before persisting content.
- [x] Route accepted work to Ticket 04's Store attendants/queue without making
  channel origin an authorization role; unassigned or inactive-team state has
  explicit owner recovery and never falls back across Stores.
- [x] Keep web, staff and WhatsApp as adapters; none owns Request lifecycle or duplicates domain commands.
- [x] Preserve explicit staff actor attribution and provider event identity without exposing private content in logs or URLs.
- [x] Return the same accepted result for duplicate submission/webhook replay and reject payload-hash mismatches.
- [x] Provide safe stale, disabled, ambiguous, unsupported and temporary-failure recovery responses.
- [x] Consume Ticket 04's stable Store entry point as an intake adapter. The
  resolved page may begin only a currently permitted web/WhatsApp request and
  must re-resolve Store/channel/policy state before customer content is
  accepted; this ticket does not recreate link/QR configuration.
- [ ] Test all three origins for exact Product demand, `commerce_inquiry`,
  progressive draft resolution, Generic Service and the compatible Pharmacy
  path, including image/document attachments, cross-Tenant routing and inactive
  Store rejection. Include entry-token replay/revocation and central branch
  resolution without retesting QR generation as intake ownership.
- [x] Reuse Ticket 04A for generic attachment ingestion, private storage,
  safety, retry and verified observations. Source/vertical interpretation,
  command eligibility and retention extensions stay source-owned; Pharmacy
  OCR and clinical review remain Pharmacy-specific.
