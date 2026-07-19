# 04 — Publish versioned Product unit configurations

**What to build:** Let a merchant configure neutral Unit Definitions, one
Canonical Inventory Unit, exact Unit Factors, transaction precision, and Stock
Behavior in Draft, then validate and publish an immutable Current version.

**Blocked by:** 02 — Deliver simple Product and Service setup end to end

**Status:** source-complete-pending-behavioral-validation

- [ ] Platform and merchant Unit Definitions provide vocabulary only and never inject factors, prices, or industry templates.
- [ ] Draft configuration supports canonical, alternate-transaction, and packaged Stock Behaviors with exact direct factors.
- [ ] Publication proves precision representability, subtype validity, identifier uniqueness, and one canonical anchor.
- [ ] Current and Superseded configurations are immutable; editing starts from a copied Draft.
- [ ] Unsafe semantic changes require an explicit Stock Transition when balances or reservations exist.
- [ ] Advanced dashboard/mobile review clearly explains `1 configured unit = X canonical units` and blocks invalid activation.
