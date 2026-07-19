# 09 — Deliver Offering-snapshot Orders, reservations, and returns

**What to build:** Let checkout select stable Sellable Offerings, create mixed
Product/Service Commercial Orders with immutable Offering Snapshots, fulfill
Product lines from exact Balance Sources, and separate returns from refunds.

**Blocked by:** 03 — Deliver advanced variants, Offerings, and Store availability; 05 — Sell alternate units from one Shared Stock Pool; 06 — Transform and sell independently balanced Packaged Stock

**Status:** source-complete-pending-behavioral-validation

- [ ] Every Order line selects one Offering and freezes subtype, option, pricing, quantity, and fulfillment meaning used at confirmation.
- [ ] Product snapshots retain unit/configuration/factor/Stock Behavior/Balance Source meaning; Service snapshots contain no inventory fields.
- [ ] Mixed Orders apply Product reservations/fulfillment and leave Service lines inventory-free atomically and idempotently.
- [ ] Price or catalog changes affect future selection only and never rewrite historical snapshots.
- [ ] Product returns default to the original Balance Source with explicit disposition; refund remains a separate Commerce record.
- [ ] POS, mobile, and storefront selection use Offerings rather than ProductVariant-as-unit identity.
