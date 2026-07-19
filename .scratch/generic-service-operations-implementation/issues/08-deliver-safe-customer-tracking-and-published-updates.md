# 08 — Deliver safe customer tracking and published updates

**What to build:** Give eligible customers scoped, revocable tracking access to
allowlisted Service milestones, promises, approved messages, published
evidence, and permitted payment actions without exposing the internal Job.

**Blocked by:** 02 — Deliver Job Line progress and partial readiness; 05 — Deliver managed private Service Evidence and publication; 07 — Deliver public Service Requests and versioned Quotes

**Status:** source-complete-pending-behavioral-validation

- [ ] Tracking access uses opaque tokens with secure storage, Store/Job/customer scope, rotation, revocation, optional expiry, and rate limiting.
- [ ] Public milestones are allowlisted projections and do not serialize internal status/event models directly.
- [ ] Only explicitly published available evidence and approved Customer Messages appear.
- [ ] Internal notes, staff identities, private contacts/evidence, storage keys, tenant existence, and raw ids are absent.
- [ ] Storefront owns tracking and Quote approval; marketing links without duplicating implementation; authenticated dashboard remains on the shared host.
- [ ] Token misuse, enumeration, revocation, expiry, caching, and tenant-isolation tests pass.
