# ADR-0030: Progressive Catalog And Thin Pharmacy Extension

## Status

Accepted as the product and architecture amendment on 2026-08-09. The owner
approved the revised 15-ticket source batch on the same date. Source work may
resume in declared dependency order; production database/provider operations
remain separately authorized.

## Context

Many first customers will begin with assisted requests and Quotes before they
are ready to configure their complete Catalog and exact inventory. Customer
demand should help the business build that Catalog progressively: an operator
can match a requested product or service, create a private draft when it is
missing, see attributable historical price suggestions, enter the current
Quote price, and later complete the remaining Catalog and inventory facts.

The existing approved plan protects exact Product cart/Order behavior and
reuses immutable Quotes, but it does not own the request-to-draft-Catalog,
historical-price-suggestion, or graduation-to-managed-inventory lifecycle.
Pharmacy Commerce also remains described as a broad parallel product, even
though its channel, Quote, payment and fulfilment infrastructure should be
shared before launch.

The repository already provides useful primitives: `CatalogItem`,
`SellableVariant` and `SellableOffering` have private `DRAFT` states;
`CommerceQuoteLine` stores immutable descriptions and prices;
`CatalogPriceChange` stores explicit price history; and Orders retain immutable
Offering snapshots. Inventory quantities remain separate ledger facts.

## Decision

- Add Progressive Catalog as a shared Service Commerce capability for
  businesses that have not yet adopted complete managed inventory.
- Approve `commerce_inquiry` as the narrow Commerce-owned source for Product
  demand that requires identification, availability confirmation or a Quote.
  Exact known Product demand continues through cart and Commercial Order.
- Reuse private `DRAFT` Catalog Items, Variants and Offerings for operator-
  confirmed missing demand. Do not introduce a second candidate Catalog.
- Preserve a typed, Tenant/Store-scoped source link and verified aliases from
  the request/Prescription line to the draft or existing Offering. Raw OCR,
  customer text or provider payloads never publish Catalog records directly.
- Price suggestions are read-only projections from attributable facts. Their
  precedence is current Offering price, recent accepted Quote or completed
  sale for the same Store, then an authorized Tenant-level history. Every
  suggestion exposes source, currency and effective time; unknown remains
  unknown.
- An operator-entered Quote price changes only the immutable Quote version.
  Updating the reusable Catalog price is a separate authorized, confirmed and
  audited command. Its confirmation shows the existing Offering price scope,
  including every bound Store when that price is Tenant-wide. A rejected/draft
  Quote never silently changes Catalog price.
- A Quote or sale does not invent stock. Progressive Product Offerings use an
  explicit, expiring manual/procure-to-order availability attestation when
  exact stock is not managed. Acceptance creates the appropriate procurement
  or fulfilment commitment; stock reservations occur only against configured
  balance sources with sufficient quantity.
- Graduation to managed inventory enriches the existing draft/active Catalog
  graph with units, variants, SKUs/barcodes, Store availability and a verified
  opening count/stock operation. It preserves every Quote, Order, price and
  source link rather than recreating items.
- Draft or progressive records are private by default. Public storefront
  visibility, active sellability and managed-inventory readiness are distinct
  explicit states; no request automatically publishes a Product, Service or
  medicine.
- Service Commerce is the single business-facing assisted-commerce workspace
  and shared lifecycle. Pharmacy is a thin regulated extension that owns only
  prescription media/OCR, human verification, pharmacist release,
  substitution, privacy/retention, break-glass and regulated eligibility.
- `PrescriptionRequest` and its private clinical records remain a focused
  source aggregate. Keeping that aggregate does not authorize duplicate
  channel, Quote, payment, pickup, delivery, Catalog-adoption or reporting
  implementations.
- A verified Prescription line may propose or link a private Catalog draft only
  after human verification. OCR alone cannot create or publish medicine.
  Pharmacy availability or procure-to-order commitment remains pharmacist-
  released and policy-gated.
- Because no customer is live on Prescription Commerce, compatibility remains
  an implementation safety net rather than a reason to preserve duplicate
  orchestration indefinitely. After shared cross-vertical acceptance, a
  separately approved contraction removes redundant Prescription-facing
  commerce orchestration while retaining the regulated source module.

## Consequences

- A business can begin with requests and Quotes, accumulate useful private
  Catalog and price history, and adopt exact inventory incrementally.
- Quotes remain trustworthy snapshots, while Catalog price and inventory truth
  continue to require explicit commands.
- The platform supports unavailable or procure-to-order demand without
  pretending the Store currently holds stock.
- Pharmacy safety stays structurally mandatory where applicable, but shared
  commerce behavior is maintained once rather than twice.
- The revised ticket batch adds two dependency-ordered vertical slices:
  request-to-progressive-Catalog capture and progressive-to-managed-inventory
  graduation. Existing affected tickets must consume those contracts.

## Rejected Alternatives

- Automatically publish every requested line: unsafe, duplicate-prone and
  capable of exposing sensitive or incorrect customer/OCR text.
- Treat the last Quote as the current Catalog price: confuses a transaction
  snapshot with reusable pricing and bypasses authorization.
- Treat a Quote or Order as proof of stock: corrupts the inventory ledger.
- Create one universal request/clinical workflow table: erases source policy
  and produces invalid state combinations.
- Keep Prescription Commerce as a second complete product: duplicates shared
  infrastructure and creates avoidable pre-launch maintenance.
- Delete the Prescription source aggregate: removes the boundary that makes
  professional release, privacy and audit requirements mandatory.

## References

- `.brain/decisions/ADR-0029-service-commerce-platform-core-and-vertical-capability-extensions.md`
- `.brain/features/service-commerce.md`
- `.scratch/service-commerce/spec.md`
- `.scratch/service-commerce/midday-migration-contract.md`
- `.scratch/service-commerce/issues/README.md`
