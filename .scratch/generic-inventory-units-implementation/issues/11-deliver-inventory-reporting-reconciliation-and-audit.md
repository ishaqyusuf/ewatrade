# 11 — Deliver inventory reporting, reconciliation, and audit

**What to build:** Give managers and auditors Balance Source reporting,
compatible canonical analysis, grouped Stock Operation history, transformation
conservation, custody reconciliation, and exact exports without inventing
cross-balance fulfillment availability.

**Blocked by:** 06 — Transform and sell independently balanced Packaged Stock; 08 — Deliver transfers, Stock Custody, and closeout reconciliation; 09 — Deliver Offering-snapshot Orders, reservations, and returns; 10 — Deliver offline Catalog, stock, and sale conflict review

**Status:** source-complete-pending-behavioral-validation

- [ ] Operational inventory reports show one row per actual Balance Source with on-hand, reserved, available, unit, Store, variant, and custody meaning.
- [ ] Optional compatible canonical totals display their components and are never used as automatic fulfillment availability.
- [ ] Stock Operation detail reconstructs all movements, actor, reason, effective/recorded times, idempotency source, and version snapshots.
- [ ] Transformation reports prove balanced source/target effects and separate loss adjustments.
- [ ] Closeout, transfer, reservation, return, and provisional/conflict metrics reconcile to authoritative ledger data.
- [ ] Exports use exact decimal strings and posted costing snapshots rather than current price or factor as valuation.
