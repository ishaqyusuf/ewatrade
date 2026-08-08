# 18 - Privacy, Retention, Audit, And Incident Controls

**What to build:** Complete the privacy and safety controls for prescription media, transcripts, WhatsApp content, addresses, professional decisions, and customer rights, including retention, erasure, access history, incident response, and emergency connection controls.

**Blocked by:** 06 - Media Safety Review And Clearer-Image Recovery; 07 - OCR Transcription And Line Verification; 15 - Manual Pharmacy WhatsApp Connection And Inbound Intake

**Status:** implemented-source; legal/privacy sign-off pending

- [ ] Configurable retention policies cover raw media, derived transcripts, messages, secure tokens, addresses, audit evidence, and commercial records with documented legal/business boundaries.
- [ ] Scheduled lifecycle jobs expire or delete eligible sensitive artifacts idempotently and preserve only justified tombstones or immutable accounting evidence.
- [ ] Authorized staff can perform access, correction, export, restriction, and erasure workflows with identity verification, structured reasons, and an audit trail.
- [ ] Sensitive-media, transcript, customer-data, pharmacist-decision, and credential access events are queryable by authorized compliance personnel.
- [ ] Logs, traces, analytics, job payloads, notifications, and operational alerts are tested to exclude prescription content and unnecessary personal data.
- [ ] Incident controls can suspend Prescription Commerce, freeze processing, revoke customer links or WhatsApp credentials, and preserve evidence without cross-tenant effects.
- [ ] Break-glass access is narrowly permissioned, time-bound, justified, conspicuous, and reviewed after use.
- [ ] Retention, deletion, legal-hold conflict, export, revocation, incident, authorization, and tenant-isolation tests are included.
