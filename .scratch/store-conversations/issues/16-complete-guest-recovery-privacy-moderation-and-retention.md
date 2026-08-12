# 16 — Complete Guest Recovery, Privacy, Moderation, And Retention Controls

**What to build:** Complete the customer-visible and operator recovery/security
boundary for guest credentials, linked devices, restricted conversations,
abuse, malicious media, sensitive reads, retention, deletion, and incident-safe
operation across EwaTrade and bridged channels.

**Blocked by:** 07 — Send And Play Bounded Private Voice Notes; 11 — Offer Optional Account Adoption And Explicit Guest Linking; 15 — Handle Direct WhatsApp Discovery And The Mixed-Channel Timeline

**Status:** ready-for-agent

- [ ] Guest device credentials rotate with bounded overlap, expire after the
      approved inactivity default, revoke individually, and never expose raw
      bearer material in persistence, logs, analytics, or support tools.
- [ ] Clearing/reinstalling/changing device loses guest access honestly; account-
      linked customers recover through authentication, while unsupported guest
      cross-device recovery never relies on contact matching.
- [ ] Customer device/account security and safe support recovery handle expired,
      lost, conflicting, already-linked, and suspected-compromise cases without
      moving conversation ownership silently.
- [ ] Store moderation can restrict/reinstate new customer submission with reason,
      current actor authority, revision, audit, customer-safe wording, appeal/
      contact recovery, and no deletion of existing typed Requests or history.
- [ ] Rate limits combine guest/device/account, Store Entry, network risk, action
      cost, verification, bridge, and media signals; IP alone is neither identity
      nor the sole limit.
- [ ] Enumeration, spam bursts, bridge guessing, verification abuse, malicious
      files/audio, oversized content, replay, and cross-scope attempts fail
      before expensive/provider/clinical effects and create bounded redacted
      security evidence.
- [ ] Risk-triggered challenge is available without forcing every legitimate
      anonymous customer through CAPTCHA or account registration.
- [ ] Sensitive staff/media reads require current personal authorization and
      append immutable purpose/outcome audit; Pharmacy break-glass and clinical
      retention remain separately authoritative.
- [ ] Retention is classification-specific: credentials, contacts, presentation
      messages, generic media, clinical media, commercial records, audit, and
      provider attempts do not inherit one accidental global lifetime.
- [ ] Customer access/deletion requests use approved identity proof, remove
      unnecessary presentation/contact/device data, and preserve required
      commercial/clinical/audit facts with truthful status.
- [ ] Logs, reports, crash telemetry, URLs, notifications, and job payloads pass
      automated redaction checks for content, contacts, tokens, private object
      refs, provider ids, and clinical facts.
- [ ] Security/privacy integration and failure-injection acceptance proves
      rotation/revocation, moderation, abuse throttling, malicious media,
      sensitive audit, deletion/retention, cross-Tenant isolation, and rollback.
- [ ] Brain privacy, security, retention, schema, API, permission, incident,
      feature, and task records are complete and truthfully preserve external
      legal/provider approval gates.
