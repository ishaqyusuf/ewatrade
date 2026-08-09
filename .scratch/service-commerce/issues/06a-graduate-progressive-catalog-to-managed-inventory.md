# 06A - Graduate Progressive Catalog To Managed Inventory

**What to build:** Let a business complete its progressively accumulated
Product and Service Catalog records and switch eligible Store Offerings to
managed operation without recreating items or losing request, Quote, Order,
price or source history.

**Blocked by:** 03A - Grow The Private Catalog From Requests And Quotes; 06 -
Reuse Quote Payment And Order Conversion.

**Status:** approved; blocked by Tickets 03A and 06

**Approval:** Added by the owner-requested Progressive Catalog amendment and
owner-approved as part of the revised batch on 2026-08-09.

- [ ] Project per-Offering graduation readiness and missing facts: Catalog
  classification, variant/options, Product units, SKU/barcode, Service work or
  booking policy, reusable price, Store availability and inventory setup.
- [ ] Provide a Midday setup/graduation sheet with safe URL scope, focused
  forms, explicit loading/error/retry states, exact invalidation and no
  implicit publication.
- [ ] For Products, create or complete Unit Configuration and Balance Sources,
  then record a verified opening count through one atomic Stock Operation; do
  not derive opening quantity from requests, Quotes, Orders or sales.
- [ ] For Services, complete classification, duration/work/booking and price
  policy without introducing inventory semantics.
- [ ] Preserve Catalog ids plus every verified alias, source link,
  `CatalogPriceChange`, Quote line, Offering snapshot, Commercial Order and
  audit relationship across graduation.
- [ ] Make activation/publication, managed-inventory readiness and progressive
  procure-to-order support separate confirmed commands with actor, reason and
  before/after facts.
- [ ] Reject duplicate SKU/barcode, stale draft revision, currency mismatch,
  missing role, cross-Tenant/Store scope and unexpired operational commitments
  that cannot safely switch policy.
- [ ] Prove accepted Quotes before and after graduation continue to resolve the
  same Offering while only post-graduation tracked-stock Orders reserve/debit
  the verified balance source.
- [ ] Add desktop/mobile browser QA for the gradual onboarding journey and a
  deterministic Neon acceptance fixture that starts progressive, accumulates
  demand/pricing history, graduates, and completes a managed-inventory sale.
- [ ] Update Brain/API/database/migration/runbook documentation and retain
  production migration/contraction as separately authorized work.
