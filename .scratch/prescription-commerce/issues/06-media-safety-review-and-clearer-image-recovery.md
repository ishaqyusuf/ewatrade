# 06 - Media Safety Review And Clearer-Image Recovery

**What to build:** Add the media-safety and attendant-review stage that keeps uploaded prescription media private, blocks unsafe or unreadable files from processing, and lets the pharmacy request clearer images through a secure customer recovery flow.

**Blocked by:** 04 - Public Channel Selection And Private Web Intake

**Status:** implemented-source; live-provider acceptance pending

- [ ] Newly uploaded media passes through explicit pending, safe, quarantined, rejected, and deleted states before transcription can begin.
- [ ] Staff access uses short-lived authorized delivery rather than public URLs, and every sensitive-media access is audited.
- [ ] An attendant can review all pages, rotate/navigate them, and mark the request ready for transcription or as needing clearer media.
- [ ] `NEEDS_CLEARER_MEDIA` requires a neutral reason and sends the customer a scoped, expiring re-upload route.
- [ ] Successful re-upload creates a media revision, returns the request to review, and preserves prior evidence according to retention policy.
- [ ] Unsafe, corrupt, unsupported, or provider-unavailable media fails closed without exposing content in logs or notifications.
- [ ] Provider fakes and tests cover scanning callbacks, duplicate callbacks, authorization, expiry, quarantine, re-upload, and tenant isolation.
