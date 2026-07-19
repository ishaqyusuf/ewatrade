# 05 — Sell alternate units from one Shared Stock Pool

**What to build:** Let Product Unit Offerings in canonical or Alternate
Transaction Units resolve one Shared Stock Pool, expose exact availability, and
post sale/reservation effects without creating fake per-unit balances.

**Blocked by:** 03 — Deliver advanced variants, Offerings, and Store availability; 04 — Publish versioned Product unit configurations

**Status:** source-complete-pending-behavioral-validation

- [ ] Each Store/Product/Sellable Variant owns one canonical Shared Stock Pool and alternate units own no balances.
- [ ] Offering availability resolves one declared Balance Source with no automatic fallback.
- [ ] Exact reservation, release, commit, and sale effects retain entered quantity, unit, factor, configuration version, and canonical effect.
- [ ] Indivisible offerings expose only complete available quantities while divisible offerings preserve configured precision.
- [ ] Insufficient stock, stale configuration, and duplicate replay produce stable outcomes.
- [ ] A mass or liquid example proves fractional shared-pool selling end to end across API and sales surfaces.
