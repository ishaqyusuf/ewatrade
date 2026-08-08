# 02 - Expand Commerce-Owned Quote Model

**What to build:** Introduce a source-neutral, Commerce-owned Quote aggregate beside the current Service-specific quote model, with immutable versions, typed sources, secure customer access, and idempotent acceptance seams while leaving the existing Service workflow operational.

**Blocked by:** None - can start immediately.

**Status:** implemented-source; production acceptance pending

- [ ] A Commerce Quote has exactly one typed source and supports Service Request and Prescription Request sources without nullable multi-source ambiguity.
- [ ] Quote versions are immutable snapshots containing lines, totals, currency, fulfilment terms, expiry, availability outcome, and customer-facing notes.
- [ ] Full, partial, unavailable, expired, superseded, accepted, and declined outcomes have explicit semantics and valid transitions.
- [ ] Secure customer access tokens are stored as digests, scoped to the correct quote/store, revocable, and non-enumerable.
- [ ] The acceptance contract is idempotent and exposes a safe seam for creating an order and reservations atomically in a later ticket.
- [ ] Existing Service Quote APIs and pages continue to work during the expansion phase.
- [ ] Schema, repository, contract, transition, tenant-isolation, and compatibility tests cover the new foundation.
