# 07 - OCR Transcription And Line Verification

**What to build:** Generate a non-authoritative transcription draft asynchronously and give an attendant a side-by-side workflow to verify every prescription line before the request can reach a pharmacist.

**Blocked by:** 06 - Media Safety Review And Clearer-Image Recovery

**Status:** implemented-source; live-provider acceptance pending

- [ ] Safe reviewed media can enqueue an idempotent OCR/transcription job and move through `TRANSCRIBING` into `ATTENDANT_VERIFICATION`.
- [ ] A provider-neutral OCR interface and deterministic fake support success, low-confidence, partial, timeout, and unavailable outcomes.
- [ ] The review UI shows original pages beside draft lines and supports correction, deletion, addition, and explicit unreadable marking.
- [ ] Every line requires an explicit verified or unreadable decision; confidence scores alone can never release the request.
- [ ] Staff can bypass failed OCR and transcribe manually without creating a separate request type.
- [ ] New media revisions invalidate stale drafts and verification decisions while retaining an auditable revision history.
- [ ] No transcription is presented as clinical interpretation, and sensitive input/output is excluded from ordinary logs and analytics.
- [ ] State-machine, job retry, concurrency, revision, permission, and accessibility tests cover the full verification path.
