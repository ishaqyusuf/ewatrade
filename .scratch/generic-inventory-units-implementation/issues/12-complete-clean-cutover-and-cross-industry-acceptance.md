# 12 — Complete the clean cutover and cross-industry acceptance

**What to build:** Remove the rejected ProductVariant/unit bridge completely,
reset development data, seed neutral examples, update all clients and Brain
contracts, and prove the implementation through cross-surface acceptance and
source-deletion gates.

**Blocked by:** 10 — Deliver offline Catalog, stock, and sale conflict review; 11 — Deliver inventory reporting, reconciliation, and audit

**Status:** source-complete-pending-behavioral-validation

- [ ] Old unit-template, conversion-multiplier, per-unit InventoryItem, paired conversion event, staff-wallet, metadata fallback, and legacy Service runtime paths are deleted.
- [ ] No feed/bag preset, industry runtime key, compatibility alias, dual write, or old offline reader remains.
- [ ] Neutral seeds cover piece/carton, mass, length, liquid, shared pool, Packaged Stock, real variants, and Service Offerings.
- [ ] Required migration generation, local/production/attempted-remote database pushes, generated clients, typecheck, lint/format, and package tests are completed and reported.
- [ ] Dashboard, mobile, storefront, POS, offline, reporting, tenant-isolation, and exact-arithmetic acceptance suites pass.
- [ ] Brain database, API, permission, feature, ADR, task, and glossary documents match the implemented model.
