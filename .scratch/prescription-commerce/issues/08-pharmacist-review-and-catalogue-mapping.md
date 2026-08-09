# 08 - Pharmacist Review And Catalogue Mapping

**What to build:** Give an authorized pharmacist a professional-review queue where verified prescription lines can be compared with the original media, mapped to store Product Offerings, checked for availability, and explicitly released, clarified, or declined.

**Blocked by:** 01 - Store Activation And Professional Roles; 07 - OCR Transcription And Line Verification

**Status:** implemented-source; production acceptance pending

**Verification note (2026-08-09):** pharmacist review now shows authorized
original media and all transcription revisions together. Each payable line
requires an active Store Product Offering, positive exact quantity, sufficient
current stock, an inventory configuration/revision snapshot, explicit
alternative state, and customer-visible wording before the revision-confirmed
release command. Exact credentialed-role, Tenant/Store, stale-revision,
catalogue, transition, inventory, and verified Neon lifecycle evidence passes.

- [x] Only a pharmacist with an active credentialed role for the current store can perform professional release actions.
- [x] The pharmacist sees original media, the verified transcript, revision history, and any unreadable or unresolved lines together.
- [x] Each releasable line maps to an existing Product Offering and records quantity, availability, restriction, substitution, and customer-visible wording.
- [x] The workflow supports clarification, explicit alternatives, partial availability, decline, and ready-to-quote outcomes without silently changing prescribed content.
- [x] The final action records the pharmacist, store, source revision, timestamp, decision, and structured reasons in an immutable audit trail.
- [x] Stale-page, concurrent-review, changed-media, changed-catalogue, unavailable-stock, and revoked-role cases prevent release.
- [x] The pharmacy remains the professional and commercial decision-maker; automated components never approve medication or substitution.
- [x] Permission, transition, catalogue-mapping, availability, concurrency, and tenant-isolation tests are included.
