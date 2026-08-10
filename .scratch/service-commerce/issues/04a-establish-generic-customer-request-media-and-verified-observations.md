# 04A - Establish Generic Customer Request Media And Verified Observations

**What to build:** Let any eligible business receive a private customer image
or approved document through web, staff-assisted or WhatsApp intake, recover it
safely, and turn it into an attributable human-verified observation that the
existing source and Progressive Catalog seams can use without importing
Prescription models.

**Blocked by:** 03A - Grow The Private Catalog From Requests And Quotes; 04 -
Generalize WhatsApp Connection And Location Binding; 11 - Enforce Vertical And
Jurisdiction Eligibility.

**Status:** source foundation complete; Ticket 05 channel-adapter acceptance and
live provider/browser gates remain open

**Approval:** Added through the owner-approved generic Customer Channels/media
amendment on 2026-08-10.

- [x] Add private, Tenant/Store-scoped generic Media Asset, typed Source
  Attachment and revisioned Human-Verified Observation contracts; do not add a
  universal Request aggregate or store attachment facts as arbitrary source
  JSON.
- [x] Add a disabled-by-default `attachments` Store capability/readiness fact;
  onboarding category may recommend it, but server channel/source/policy and
  configured provider readiness decide whether customers can use it.
- [x] Record channel origin, source kind/id/version, provider/client
  idempotency identity, content digest, allowlisted media type, filename, byte
  size, private object reference, lifecycle/safety state, retention class and
  immutable audit facts without exposing provider identifiers or object keys.
- [x] Expose one server boundary for public web, staff-assisted and WhatsApp
  adapters that accepts images/documents only after current Tenant, Store,
  channel, capability and vertical-policy resolution. Ticket 05 owns the final
  public-web and generic WhatsApp intake adapter wiring.
- [x] Keep webhook/API transports thin. Persist an idempotent inbound media
  reference, then use identifier-only retrieval/storage/safety jobs with
  bounded retry so a temporary provider download or scanner failure does not
  silently lose customer content.
- [x] Validate file signature, type and size, store bytes privately, distinguish
  pending/safe/quarantined/rejected/retryable/deleted states, and prevent
  viewing or interpretation until the governing state permits it.
- [x] Provide short-lived, server-authorized staff viewing with expiry/embed-
  failure reauthorization, explicit loading/error/retry/reupload states and
  audited access. Public projections expose only safe status and recovery.
- [x] Let an authorized human create or revise an attributable observation such
  as `bag / red / small`; automated analysis may suggest, but never verifies,
  publishes, prices, substitutes, reserves stock or creates an Order.
- [x] Feed only the verified observation/source-line facts into Ticket 03A's
  match/link/private-draft seam. Raw media, customer text and provider payloads
  never become Catalog aliases or public Catalog records.
- [x] Define baseline private retention/deletion rules for ordinary commerce
  attachments while allowing Pharmacy to impose stricter clinical access,
  retention, OCR/review and professional-release extensions.
- [x] Prove the non-Pharmacy bag-image repository journey through safe
  attachment, `red small bag` human verification and private-draft Catalog
  resolution, plus replay and cross-Tenant/Store rejection with no
  Prescription-package dependency. Focused source tests cover staff upload,
  unsafe files, retry, stale source and grant rules; Ticket 05 owns final
  public-web/generic-WhatsApp adapter acceptance.
- [x] Keep generic OCR/vision authority, public asset publication, live storage
  or scanner rollout, and `PrescriptionMedia` contraction out of this ticket;
  update Brain/API/database/migration documentation with the exact implemented
  contracts and evidence.
