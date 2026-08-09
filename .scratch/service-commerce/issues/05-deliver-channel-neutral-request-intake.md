# 05 - Deliver Channel-Neutral Request Intake

**What to build:** Route web, staff-assisted and WhatsApp customer intent through one channel contract into the correct source aggregate, with explicit origin/actor attribution and identical idempotency guarantees.

**Blocked by:** 03 - Establish Customer Request Interoperability Contract; 03A —
Grow The Private Catalog From Requests And Quotes; 04 - Generalize WhatsApp
Connection And Location Binding; 11 - Enforce Vertical And Jurisdiction
Eligibility.

**Status:** approved; blocked by Tickets 03, 03A, 04, and 11

**Approval:** Original and revised Progressive Catalog intake scope
owner-approved on 2026-08-09.

- [ ] Define shared intake envelope fields for channel, opaque Store context, client/provider idempotency, consent/opt-in facts and source-specific payload.
- [ ] Resolve Tenant, Store, capability, source adapter and authorization before persisting content.
- [ ] Keep web, staff and WhatsApp as adapters; none owns Request lifecycle or duplicates domain commands.
- [ ] Preserve explicit staff actor attribution and provider event identity without exposing private content in logs or URLs.
- [ ] Return the same accepted result for duplicate submission/webhook replay and reject payload-hash mismatches.
- [ ] Provide safe stale, disabled, ambiguous, unsupported and temporary-failure recovery responses.
- [ ] Test all three origins for exact Product demand, `commerce_inquiry`,
  progressive draft resolution, Generic Service and the compatible Pharmacy
  path, including cross-Tenant routing and inactive Store rejection.
- [ ] Keep media/safety/OCR entirely within source-specific policy when a source requires it.
