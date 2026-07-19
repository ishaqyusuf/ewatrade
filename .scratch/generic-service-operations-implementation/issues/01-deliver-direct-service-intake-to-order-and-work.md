# 01 — Deliver direct Service Intake through Order and tracked work

**What to build:** Give staff the shortest generic Intake flow—select concrete
Service Offerings and exact quantities, optionally add context, review, and
confirm—creating one Commercial Order and only the authorized tracked work.

**Blocked by:** Generic Inventory 02 — Deliver simple Product and Service setup end to end; Generic Inventory 03 — Deliver advanced variants, Offerings, and Store availability; Generic Inventory 09 — Deliver Offering-snapshot Orders, reservations, and returns

**Status:** source-complete-pending-behavioral-validation

- [ ] Service Offering declares charge-only/tracked Work Policy and Order-confirmation/payment-required/manual Work Authorization Policy.
- [ ] Draft Intake requires only active Store-available Offering and positive exact quantity; customer, timing, instructions, evidence, priority, and assignment are optional.
- [ ] Requested time and merchant Due Commitment remain distinct.
- [ ] Confirmation revalidates Offering, price, quantity precision, capability, Store, and idempotency, then creates Order and tracked allocations atomically.
- [ ] Charge-only lines create no work; tracked lines cannot progress before authorization.
- [ ] Dashboard/mobile shortest-path Intake, mixed Product/Service Order, and no-Service-inventory acceptance tests pass.
