# 04 - Public Channel Selection And Private Web Intake

**What to build:** Let a customer enter from a store QR code or shareable link, choose a supported contact channel, give required consent, securely upload a multi-page prescription, and receive a reference while the same request appears in the store work queue.

**Blocked by:** 01 - Store Activation And Professional Roles

**Status:** implemented-source; production acceptance pending

**Verification note (2026-08-09):** the stable Store channel, public intake and
status projections, private-media provider boundary, bounded multi-page manifest,
Store-attributed queue predicate, neutral reference, idempotent replay, changed-
payload rejection, and inactive-Store failure are covered by focused tests plus
the authenticated Neon web lifecycle. Browser-level mobile accessibility remains
part of the open non-functional acceptance gate in ticket 20.

- [x] Every enabled store has a stable public Prescription Commerce link and printable QR destination with correct tenant/store attribution.
- [x] Intake captures minimum contact details, source channel, consent evidence, fulfilment intent, and multi-page media without asking for avoidable sensitive data.
- [x] Media uses a provider-neutral private-storage contract with non-public object keys, type/size/page limits, and a deterministic test adapter.
- [x] Submitting intake creates one Prescription Request in `RECEIVED`, preserves attribution, and does not create duplicate requests when the client retries.
- [x] The customer receives a neutral acknowledgement, secure status route, and non-sensitive reference that can be shared with pharmacy staff.
- [x] The request becomes visible only in the owning store's prescription queue; disabled, unknown, or ambiguous store context fails closed.
- [ ] Mobile accessibility, upload failure/retry, malformed media, consent, authorization, and tenant-isolation tests are included.
