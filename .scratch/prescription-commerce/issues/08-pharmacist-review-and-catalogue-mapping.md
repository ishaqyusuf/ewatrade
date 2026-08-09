# 08 - Pharmacist Review And Catalogue Mapping

**What to build:** Give an authorized pharmacist a professional-review queue where verified prescription lines can be compared with the original media, mapped to store Product Offerings, checked for availability, and explicitly released, clarified, or declined.

**Blocked by:** 01 - Store Activation And Professional Roles; 07 - OCR Transcription And Line Verification

**Status:** implemented-source; production acceptance pending

**Verification note (2026-08-09):** pharmacist review now shows original media
and all transcription revisions together. Each line captures availability,
offering, quantity, explicit alternative/substitution state, and
customer-visible wording before the revision-confirmed release command.

- [ ] Only a pharmacist with an active credentialed role for the current store can perform professional release actions.
- [ ] The pharmacist sees original media, the verified transcript, revision history, and any unreadable or unresolved lines together.
- [ ] Each releasable line maps to an existing Product Offering and records quantity, availability, restriction, substitution, and customer-visible wording.
- [ ] The workflow supports clarification, explicit alternatives, partial availability, decline, and ready-to-quote outcomes without silently changing prescribed content.
- [ ] The final action records the pharmacist, store, source revision, timestamp, decision, and structured reasons in an immutable audit trail.
- [ ] Stale-page, concurrent-review, changed-media, changed-catalogue, unavailable-stock, and revoked-role cases prevent release.
- [ ] The pharmacy remains the professional and commercial decision-maker; automated components never approve medication or substitution.
- [ ] Permission, transition, catalogue-mapping, availability, concurrency, and tenant-isolation tests are included.
