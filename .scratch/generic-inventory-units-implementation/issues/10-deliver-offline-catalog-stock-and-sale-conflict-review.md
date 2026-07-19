# 10 — Deliver offline Catalog, stock, and sale conflict review

**What to build:** Replace old local variant/unit caches and conversion events
with versioned Offering, configuration, Balance Source, Stock Operation, and
Order commands that remain provisional until authoritative replay.

**Blocked by:** 07 — Deliver receipts, counts, adjustments, and corrections; 08 — Deliver transfers, Stock Custody, and closeout reconciliation; 09 — Deliver Offering-snapshot Orders, reservations, and returns

**Status:** source-complete-pending-behavioral-validation

- [ ] Local schema reset discards incompatible caches and queued events without compatibility readers.
- [ ] New offline envelopes carry stable client ids, dependency ids, exact decimal strings, configuration/revision snapshots, and event version.
- [ ] Accepted retries are idempotent and provisional projections are visibly distinct from authoritative balances.
- [ ] Stale configuration, Offering/price, balance, reservation, permission, and unsupported-client outcomes become typed review items.
- [ ] Conflict review shows attempted action, authoritative state, safe retry/discard choices, and dependent-event impact.
- [ ] Offline Product setup, receipt/count, sale, custody/closeout, and reconnect acceptance suites pass.
