# 06A - Graduate Progressive Catalog To Managed Inventory

**What to build:** Let a business complete its progressively accumulated
Product and Service Catalog records and switch eligible Store Offerings to
managed operation without recreating items or losing request, Quote, Order,
price or source history.

**Blocked by:** 03A - Grow The Private Catalog From Requests And Quotes; 06 -
Reuse Quote Payment And Order Conversion.

**Status:** complete

**Approval:** Added by the owner-requested Progressive Catalog amendment and
owner-approved as part of the revised batch on 2026-08-09.

- [x] Project per-Offering graduation readiness and missing facts: Catalog
  classification, variant/options, Product units, SKU/barcode, Service work or
  booking policy, reusable price, Store availability and inventory setup.
- [x] Provide a Midday setup/graduation sheet with safe URL scope, focused
  forms, explicit loading/error/retry states, exact invalidation and no
  implicit publication.
- [x] For Products, create or complete Unit Configuration and Balance Sources,
  then record a verified opening count through one atomic Stock Operation; do
  not derive opening quantity from requests, Quotes, Orders or sales.
- [x] For Services, complete classification, duration/work/booking and price
  policy without introducing inventory semantics.
- [x] Preserve Catalog ids plus every verified alias, source link,
  `CatalogPriceChange`, Quote line, Offering snapshot, Commercial Order and
  audit relationship across graduation.
- [x] Make activation/publication, managed-inventory readiness and progressive
  procure-to-order support separate confirmed commands with actor, reason and
  before/after facts.
- [x] Reject duplicate SKU/barcode, stale draft revision, currency mismatch,
  missing role, cross-Tenant/Store scope and unexpired operational commitments
  that cannot safely switch policy.
- [x] Prove accepted Quotes before and after graduation continue to resolve the
  same Offering while only post-graduation tracked-stock Orders reserve/debit
  the verified balance source.
- [x] Add desktop/mobile browser QA for the gradual onboarding journey and a
  deterministic Neon acceptance fixture that starts progressive, accumulates
  demand/pricing history, graduates, and completes a managed-inventory sale.
- [x] Update Brain/API/database/migration/runbook documentation and retain
  production migration/contraction as separately authorized work.

## Evidence

- Shared readiness and command contracts distinguish Product stock facts from
  Service duration/work/booking facts and keep publication separate.
- Repository commands are Owner/Admin-gated, Tenant/Store scoped, revisioned,
  policy-authorized and idempotent. Product graduation records explicit opening
  stock through one bounded transaction; Service graduation creates no stock.
- A verified `.env.local` Neon acceptance passed the pre-graduation manual
  Quote/Order, same-ID graduation, separate publication and post-graduation
  tracked reservation path with 8 assertions. `bun db:migrate` generated and
  applied `20260811000805_service_commerce_catalog_graduation`; `bun db:push`
  reported the development schema in sync. No Docker/local PostgreSQL or
  production database was used.
- Authenticated desktop and 390x844 mobile QA passed the Product form,
  graduation, separate publication, refreshed Catalog row, stale-ID retry and
  URL-close behavior. Browser QA exposed and fixed a form-reset render loop and
  missing Catalog-list invalidation. The run-owned QA Tenant/User graph was
  removed afterward.
- Focused verification: 49 tests / 145 assertions plus Service Commerce, DB,
  API and dashboard typechecks.
