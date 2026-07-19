# 01 — Establish the clean Catalog, Offering, and exact-quantity foundation

**What to build:** Replace the overloaded Product/variant/unit foundation with
the clean business-owned Catalog Item, Product/Service subtype, Sellable
Variant, exclusive Sellable Offering, exact-decimal primitives, and destructive
development reset needed by every later slice.

**Blocked by:** None — can start immediately

**Status:** source-complete-pending-behavioral-validation

- [ ] Catalog Item kind is immutable Product or Service and every item has an explicit default or configured Sellable Variant.
- [ ] Sellable Offering is exactly one Product Unit Offering or Service Offering, with fixed or quote-required pricing enforced correctly.
- [ ] Exact quantities and factors cross boundaries as validated decimal strings; binary floating-point stock arithmetic is absent.
- [ ] Service records cannot acquire inventory relationships, and subtype violations fail transactionally.
- [ ] Development schema/data reset uses no legacy ids, backfill, dual writes, aliases, or metadata fallbacks.
- [ ] Domain, database, API-contract, and clean-reset tests pass for the new foundation.
