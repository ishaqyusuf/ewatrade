# 07 - OCR Transcription And Line Verification

**What to build:** Generate a non-authoritative transcription draft asynchronously and give an attendant a side-by-side workflow to verify every prescription line before the request can reach a pharmacist.

**Blocked by:** 06 - Media Safety Review And Clearer-Image Recovery

**Status:** implemented-source; live-provider acceptance pending

**Verification note (2026-08-09):** the attendant sheet now keeps an authorized,
navigable original-page viewer beside editable lines. Corrections, additions,
and deletions create a new guarded transcription revision, supersede without
overwriting the prior draft, and remain visible in revision history. Deterministic
OCR covers success, low-confidence, partial, timeout, and unavailable outcomes;
job retry and the verified Neon human-gate lifecycle are green. Live OCR and the
browser accessibility/concurrency matrix remain open.

- [x] Safe reviewed media can enqueue an idempotent OCR/transcription job and move through `TRANSCRIBING` into `ATTENDANT_VERIFICATION`.
- [x] A provider-neutral OCR interface and deterministic fake support success, low-confidence, partial, timeout, and unavailable outcomes.
- [x] The review UI shows original pages beside draft lines and supports correction, deletion, addition, and explicit unreadable marking.
- [x] Every line requires an explicit verified or unreadable decision; confidence scores alone can never release the request.
- [x] Staff can bypass failed OCR and transcribe manually without creating a separate request type.
- [x] New media revisions invalidate stale drafts and verification decisions while retaining an auditable revision history.
- [x] No transcription is presented as clinical interpretation, and sensitive input/output is excluded from ordinary logs and analytics.
- [ ] State-machine, job retry, concurrency, revision, permission, and accessibility tests cover the full verification path.
