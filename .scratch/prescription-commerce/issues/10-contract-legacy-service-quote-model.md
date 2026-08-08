# 10 - Contract Legacy Service Quote Model

**What to build:** Remove the obsolete Service-specific Quote implementation and compatibility paths after Service and Prescription journeys both rely on the Commerce-owned Quote aggregate.

**Blocked by:** 03 - Migrate Service Requests To Commerce Quotes; 09 - Prescription Quote To Pickup Order

**Status:** blocked on approved migration/backfill and reconciliation

- [ ] Runtime Service and Prescription paths read and write only the Commerce-owned Quote aggregate.
- [ ] Historical Service quotes and accepted-order relationships have been migrated and validated before old storage is removed.
- [ ] Obsolete Service Quote models, repositories, contracts, routes, flags, and compatibility branches are deleted or deliberately retained with documented evidence.
- [ ] Foreign keys, indexes, generated database clients, API types, and fixtures reflect the contracted model.
- [ ] Existing Service and new Prescription request-to-order regression suites remain green after contraction.
- [ ] Data-integrity checks prove there are no orphaned quote versions, sources, customer links, or accepted orders.
- [ ] The migration is deployment-safe and includes a documented rollback or recovery strategy appropriate to the repository's migration tooling.
