# 07 — Deliver receipts, counts, adjustments, and corrections

**What to build:** Let inventory staff receive external stock into a declared
Balance Source, count actual balances, reconcile variance through explicit
adjustments, and correct accepted history by reversal and replacement.

**Blocked by:** 05 — Sell alternate units from one Shared Stock Pool; 06 — Transform and sell independently balanced Packaged Stock

**Status:** source-complete-pending-behavioral-validation

- [ ] Stock Receipt identifies the physical Balance Source and snapshots exact entered and canonical meaning.
- [ ] Stock Count targets one actual balance; compatible shared-unit entries may contribute to one shared-pool observation.
- [ ] Finalizing a Count posts a reasoned variance adjustment rather than overwriting balance history.
- [ ] Adjustments affect one Balance Source and cannot masquerade as transfers or transformations.
- [ ] Corrections reverse and replace accepted movements while preserving audit chronology.
- [ ] Dashboard/mobile workflows include draft, review, confirm, validation, and offline/provisional states.
