# 07 — Deliver public Service Requests and versioned Quotes

**What to build:** Let customers submit unconfirmed Service intent through a
Storefront Request Form, let staff clarify/decline/quote it, and let customers
accept only the current valid Quote Version to create one Commercial Order.

**Blocked by:** 01 — Deliver direct Service Intake through Order and tracked work; Generic Inventory 03 — Deliver advanced variants, Offerings, and Store availability; Generic Inventory 09 — Deliver Offering-snapshot Orders, reservations, and returns

**Status:** source-complete-pending-behavioral-validation

- [ ] Request Form is Store/Offering scoped, disableable, optionally expiring, and owned by the public storefront surface.
- [ ] Service Request creates no price promise, Order, Job, reservation, or payment obligation.
- [ ] Staff can request information, decline, or issue an immutable versioned Quote with exact quantities, prices, totals, currency, and expiry.
- [ ] Revising an issued Quote supersedes it; stale, expired, declined, or revoked versions cannot be accepted.
- [ ] Current-version acceptance is token-safe and idempotently creates one Order and tracked work under Work Authorization Policy.
- [ ] Deposits/balances remain Commerce actions and public cross-tenant/token privacy tests pass.
