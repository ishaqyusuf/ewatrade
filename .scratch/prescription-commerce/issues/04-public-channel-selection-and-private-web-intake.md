# 04 - Public Channel Selection And Private Web Intake

**What to build:** Let a customer enter from a store QR code or shareable link, choose a supported contact channel, give required consent, securely upload a multi-page prescription, and receive a reference while the same request appears in the store work queue.

**Blocked by:** 01 - Store Activation And Professional Roles

**Status:** implemented-source; production acceptance pending

- [ ] Every enabled store has a stable public Prescription Commerce link and printable QR destination with correct tenant/store attribution.
- [ ] Intake captures minimum contact details, source channel, consent evidence, fulfilment intent, and multi-page media without asking for avoidable sensitive data.
- [ ] Media uses a provider-neutral private-storage contract with non-public object keys, type/size/page limits, and a deterministic test adapter.
- [ ] Submitting intake creates one Prescription Request in `RECEIVED`, preserves attribution, and does not create duplicate requests when the client retries.
- [ ] The customer receives a neutral acknowledgement, secure status route, and non-sensitive reference that can be shared with pharmacy staff.
- [ ] The request becomes visible only in the owning store's prescription queue; disabled, unknown, or ambiguous store context fails closed.
- [ ] Mobile accessibility, upload failure/retry, malformed media, consent, authorization, and tenant-isolation tests are included.
