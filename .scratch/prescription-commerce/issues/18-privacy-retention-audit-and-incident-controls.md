# 18 - Privacy, Retention, Audit, And Incident Controls

**What to build:** Complete the privacy and safety controls for prescription media, transcripts, WhatsApp content, addresses, professional decisions, and customer rights, including retention, erasure, access history, incident response, and emergency connection controls.

**Blocked by:** 06 - Media Safety Review And Clearer-Image Recovery; 07 - OCR Transcription And Line Verification; 15 - Manual Pharmacy WhatsApp Connection And Inbound Intake

**Status:** implemented-source; legal/privacy sign-off pending

**Verification note (2026-08-09):** independent audit/commercial cutoffs now
drive the identifier-only retention job; mutable customer/audit content is
redacted idempotently while lifecycle/accounting tombstones remain. Sensitive
detail, media, pharmacist-decision, transcript, credential, and emergency reads
are Store-scoped and queryable. Personal break-glass grants expire within 60
minutes, are conspicuous, log every use, never grant pharmacist release, and
require a post-use review reason. Focused retention and authorization tests and
DB/API/dashboard/jobs typechecks pass; legal/privacy acceptance remains open.
Identity verification now persists the verifying user, timestamp, and bounded
evidence reference before the privacy job is queued. Retention claims and every
candidate/redaction predicate carry Tenant and Store explicitly.

- [ ] Configurable retention policies cover raw media, derived transcripts, messages, secure tokens, addresses, audit evidence, and commercial records with documented legal/business boundaries.
- [ ] Scheduled lifecycle jobs expire or delete eligible sensitive artifacts idempotently and preserve only justified tombstones or immutable accounting evidence.
- [ ] Authorized staff can perform access, correction, export, restriction, and erasure workflows with identity verification, structured reasons, and an audit trail.
- [ ] Sensitive-media, transcript, customer-data, pharmacist-decision, and credential access events are queryable by authorized compliance personnel.
- [ ] Logs, traces, analytics, job payloads, notifications, and operational alerts are tested to exclude prescription content and unnecessary personal data.
- [ ] Incident controls can suspend Prescription Commerce, freeze processing, revoke customer links or WhatsApp credentials, and preserve evidence without cross-tenant effects.
- [ ] Break-glass access is narrowly permissioned, time-bound, justified, conspicuous, and reviewed after use.
- [ ] Retention, deletion, legal-hold conflict, export, revocation, incident, authorization, and tenant-isolation tests are included.
