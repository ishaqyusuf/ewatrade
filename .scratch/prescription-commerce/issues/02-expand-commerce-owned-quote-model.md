# 02 - Expand Commerce-Owned Quote Model

**What to build:** Introduce a source-neutral, Commerce-owned Quote aggregate beside the current Service-specific quote model, with immutable versions, typed sources, secure customer access, and idempotent acceptance seams while leaving the existing Service workflow operational.

**Blocked by:** None - can start immediately.

**Status:** implemented-source; production acceptance pending

**Verification note (2026-08-09):** the Commerce-owned aggregate has one typed
source, immutable version/line snapshots, digested capability access, explicit
availability and lifecycle states, and an acceptance context that rejects stale,
unavailable, expired, or changed-identity commands while replaying the original
acceptance. Service Request compatibility remains green; production contraction
is tracked separately in ticket 10.

- [x] A Commerce Quote has exactly one typed source and supports Service Request and Prescription Request sources without nullable multi-source ambiguity.
- [x] Quote versions are immutable snapshots containing lines, totals, currency, fulfilment terms, expiry, availability outcome, and customer-facing notes.
- [x] Full, partial, unavailable, expired, superseded, accepted, and declined outcomes have explicit semantics and valid transitions.
- [x] Secure customer access tokens are stored as digests, scoped to the correct quote/store, revocable, and non-enumerable.
- [x] The acceptance contract is idempotent and exposes a safe seam for creating an order and reservations atomically in a later ticket.
- [x] Existing Service Quote APIs and pages continue to work during the expansion phase.
- [x] Schema, repository, contract, transition, tenant-isolation, and compatibility tests cover the new foundation.
