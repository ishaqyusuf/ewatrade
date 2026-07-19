# 08 — Deliver transfers, Stock Custody, and closeout reconciliation

**What to build:** Let merchants move stock between Stores and staff/session
custody without changing unit meaning, then reconcile each custody Balance
Source during closeout.

**Blocked by:** 07 — Deliver receipts, counts, adjustments, and corrections

**Status:** source-complete-pending-behavioral-validation

- [ ] Transfers preserve Inventory Unit, configuration version, Unit Factor, Stock Behavior, and exact quantity.
- [ ] Store-to-Store movement supports dispatched, in-transit, received, cancelled, and exception-safe audit history.
- [ ] Staff/session Stock Custody is a real subdivision of the same Balance Source rather than metadata or an independent wallet model.
- [ ] Assignment and return conserve Store totals transactionally.
- [ ] Closeout compares expected, declared, and variance for each custody balance and posts explicit adjustments only after confirmation.
- [ ] Authorization, tenant isolation, offline replay, and audit tests cover transfer and custody flows.
