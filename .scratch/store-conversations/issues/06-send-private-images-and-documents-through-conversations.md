# 06 — Send Private Images And Documents Through Conversations

**What to build:** Let web and mobile guests attach images and PDFs/documents to
the correct typed Request inside a Store Conversation, and let authorized Store
staff view them through the existing private-media lifecycle without weakening
Pharmacy clinical authority.

**Blocked by:** 03 — Support Multiple Typed Requests In One Store Conversation; 05 — Add The Mobile Customer Shell And Universal Store Links

**Status:** ready-for-agent

- [ ] The composer `+` action shows only attachment kinds currently permitted by
      Store capability, Request kind, channel, provider, safety, and policy.
- [ ] Web and mobile obtain bounded upload intent, validate actual bytes/MIME/
      count/size, commit through payload-bound idempotency, and render progress,
      cancel, retry, failure, and removal honestly.
- [ ] An unavailable or restricted conversation cannot upload or commit media;
      a device-local draft is never projected as sent.
- [ ] A committed asset links to exactly one staged/current typed Request and
      Store Conversation message without duplicating private object references.
- [ ] Safety states, quarantine, retry/re-upload, and terminal rejection expose
      typed customer/staff recovery without raw provider or object detail.
- [ ] Authorized staff viewing rechecks current Membership, Store, conversation,
      source, attachment, safety, policy, and capability before issuing a short-
      lived one-time viewer grant.
- [ ] Expired viewer grants expose reauthorization; raw bytes, signed URLs,
      object keys, digests, provider ids, and customer content stay out of logs,
      URL state, public projections, notifications, and identifier-only jobs.
- [ ] Generic observation/Catalog behavior still requires human verification;
      customer media never becomes product, price, availability, or inventory
      truth automatically.
- [ ] Pharmacy preserves authoritative Prescription Media, OCR/original
      comparison, attendant verification, pharmacist release, sensitive access,
      break-glass, and clinical retention; generic safety is not approval.
- [ ] Focused provider/repository/job tests cover web/mobile image and PDF,
      replay, retry, quarantine, expired grants, deletion, malicious bytes, and
      cross-Tenant/Store denial.
- [ ] Verified-database acceptance proves a generic and Pharmacy path with exact
      cleanup and no private-reference leakage.
- [ ] Browser/native/dashboard acceptance covers attachment selection, preview,
      progress, failure/retry, staff viewing, grant expiry, compact layout, and
      accessibility.
- [ ] Brain schema, relationship, API, permission, feature, privacy, migration,
      and task records reflect the reused generic/clinical boundaries.
