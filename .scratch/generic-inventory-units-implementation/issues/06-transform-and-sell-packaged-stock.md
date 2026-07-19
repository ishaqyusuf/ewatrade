# 06 — Transform and sell independently balanced Packaged Stock

**What to build:** Let merchants hold separately prepared package balances,
transform stock atomically between actual Balance Sources, record loss
separately, and sell from the selected packaged balance.

**Blocked by:** 04 — Publish versioned Product unit configurations; 05 — Sell alternate units from one Shared Stock Pool

**Status:** source-complete-pending-behavioral-validation

- [ ] Every Packaged Stock unit owns its own Store/variant Balance Source and never falls back to shared stock.
- [ ] Stock Transformation posts balanced source-out and target-in movements in one immutable operation.
- [ ] Source and target are in the same Store, Product, and Sellable Variant and exact canonical effects conserve stock.
- [ ] Transformation loss is a separately reasoned linked Stock Adjustment.
- [ ] Sales, availability, and returns use the exact selected packaged balance.
- [ ] Transforming 50 source packages into 100 half packages is proven without bag/feed runtime keys.
