# 02 — Deliver simple Product and Service setup end to end

**What to build:** Let a merchant create a simple Product with one canonical
unit, price, and optional Opening Stock or a simple Service with one fixed-price
Offering, using progressive dashboard and mobile setup backed by the clean
Catalog contracts.

**Blocked by:** 01 — Establish the clean Catalog, Offering, and exact-quantity foundation

**Status:** source-complete-pending-behavioral-validation

- [ ] Create Item begins with immutable Product or Service selection.
- [ ] Simple Product creates a default variant, Current unit configuration, canonical Inventory Unit, Product Unit Offering, Store availability, and optional audited Opening Stock.
- [ ] Simple Service creates a default variant and Service Offering with no inventory controls or records.
- [ ] Dashboard and mobile expose the shortest valid setup with validation, loading, error, and success states.
- [ ] Retrying creation is idempotent and tenant/Store/capability boundaries are enforced.
- [ ] Product and unrelated Service examples pass end-to-end acceptance without industry runtime branches.
