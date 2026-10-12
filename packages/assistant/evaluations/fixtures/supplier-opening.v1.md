# Supplier opening v1 conversation fixture

Capability `finance.supplier.opening`, action `supplier_opening`, canonical procedure
`finance.recordSupplierOpening`. Planned, dashboard only; Owner/Admin finance scope.
No model run recorded. Web component and deterministic database evidence are separate.

1. “We owed ACME 600 at the bookkeeping start.” Resolve the supplier by authorized
   name/code search and statement history; clarify amount/currency/description and
   whether this is pre-existing payable. Require explicit opening confirmation.
2. “Our existing credit with ACME was 500 when we started bookkeeping.” Distinguish
   opening ADVANCE from money paid now and current invoice allocation.
3. Ambiguous supplier or kind: clarify naturally; do not request internal identifiers.
   Preserve discovered Book and statement continuations; do not invent omitted history.
4. Date: review the server-derived Book startsAt, including subsecond precision. A
   caller date, money account, journal lines, actor, tenant or command key is rejected.
5. Exact string minor amount: positive/capped at100000000000000; zero, negatives,
   nonnumeric, fractions, overlimit and description bounds refuse.
6. One opening per supplier/kind, including reversed history. Refuse another opening;
   never silently reverse or substitute current advance/purchase/payment operations.
7. Review PAYABLE as debit opening equity/credit supplier payable; ADVANCE as debit
   supplier advance/credit opening equity. Show exact original accounts/amounts/date.
   No money-account balance change, actual transfer, invoice payment, purchase or stock.
8. Scope/authority/closed start/archived or changed controls refuse. Changed supplier
   identity/Book start/control labels/period or inserted opening requires new review.
9. Editor preserves Book/supplier/kind; changes exact amount/description only. Fresh
   acknowledgement and positive amount are required; Cancel creates no proposal edit.
10. Full acceptance still requires authentic signed completion/stale/rollback and actual
    saved dashboard Edit/re-review/Confirm, owning supplier statement Open/Close over
    assistant, reload, exact journals/balances/history and concurrent recovery.
