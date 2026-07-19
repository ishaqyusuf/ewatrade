# Audit The Current Overloaded Product-Unit Bridge

Parent: [Wayfinder: Catalog Variants, Product Units, And Sellable Offerings](../map.md)

Type: research

Status: resolved

Blocked by: None

## Question

Where does the current system conflate Sellable Variants, inventory units,
prices, SKUs, balances, ratios, templates, and offline records, and which
feed/bag-specific additions, fallback paths, APIs, schema fields, client state,
and tests must be deleted or replaced in the clean cutover?

## Comments

Produce a deletion/replacement matrix covering database models, API contracts,
dashboard, mobile, offline events, seeds, fixtures, tests, and Brain
documentation. Trace every use of ProductVariant as a unit,
InventoryItem-per-unit behavior, conversion ratios, unit templates, and
feed/bag metadata or fallbacks.

Classify every occurrence as delete, replace, or neutral behavior to retain.
Nothing should be classified for compatibility preservation. The audit is
complete when searches and user-flow traces identify every old write and read
path.

## Resolution

### Root cause

The current bridge has no independent Inventory Unit or Sellable Offering
boundary. A `ProductVariant` simultaneously represents a customer-selectable
variant, a priced/SKU-bearing offering, and a stock unit. `InventoryItem` then
creates one integer balance for every such row. Ratios attached to the variant
or its metadata are used to move stock between those balances. This makes a
bag example appear to be the domain model and prevents the system from
representing a real variant with shared-pool units, exact decimal quantities,
or separately prepared Packaged Stock.

### Deletion and replacement matrix

| Surface | Current bridge | Classification | Clean replacement |
| --- | --- | --- | --- |
| Prisma catalog | `Product` carries Store-specific catalog/commercial fields and a unit-template relation; `ProductVariant` carries price, SKU, ratio, unit-template relations, and unit metadata | Replace | Business-owned Catalog Item, immutable Product/Service subtype, real Sellable Variant, Sellable Offering with exclusive Product/Service subtype, and Store Offering Availability |
| Prisma unit templates | `ProductUnitTemplate` and `ProductUnitTemplateUnit` own integer ratios and link directly to products/variants | Delete | Unit Definition vocabulary plus Product-owned immutable Unit Configuration Versions and Inventory Units with exact decimal Unit Factors |
| Prisma balances | `InventoryItem` is unique per `productVariantId` and stores integer on-hand/reserved quantities | Replace | Store + Product + Sellable Variant Balance Sources: one canonical Shared Stock Pool and explicit Packaged Stock balances; alternate transaction units own no balance |
| Prisma custody | `StaffStockWallet` holds integer balances per ProductVariant | Replace | Stock Custody sub-balances keyed to the same declared Balance Source and exact quantity semantics |
| Prisma receipts and ledger | `StockDeliveryLine` and `InventoryMovement` identify a ProductVariant as the unit; conversions use related ProductVariant ids and paired integer quantities | Replace | Stock Receipt and immutable Stock Movement snapshots carrying Inventory Unit, configuration version, exact entered quantity, factor, canonical effect, Balance Source, and optional atomic transformation group |
| Prisma commerce | `CartItem` and `OrderItem` point at ProductVariant; current snapshots do not identify the resolved offering/unit configuration | Replace | Commercial Order lines select a Sellable Offering and retain an immutable Offering Snapshot; Product fulfillment separately posts against the selected Balance Source |
| Price history | `ProductUnitPriceHistory` points to ProductVariant and product setup mirrors price history into metadata fallbacks | Replace | Price Change history belongs to Sellable Offering; eliminate metadata mirroring and current-price fallback as compatibility behavior |
| Catalog repository | `retail-ops-products.ts` creates a default ProductVariant plus one ProductVariant and InventoryItem for every submitted “unit” | Replace | Create Catalog Item, implicit/default or explicit Sellable Variant, Product Unit Offering or Service Offering, and Product unit configuration through separate commands |
| Template/fallback repository | `FALLBACK_PRODUCT_UNIT_TEMPLATES`, missing-table detection, template merging, metadata-first ratio reads, and unknown-template tolerance | Delete | Query neutral platform/business Unit Definitions only; publication requires a complete valid Product-owned configuration |
| Stock repository | `retail-ops-stock.ts` calculates whole-number conversions from ProductVariant ratios, mutates source/target InventoryItems, and conditionally mirrors ledger rows when tables exist | Replace | Exact-decimal balance postings and explicit shared-pool transactions or Stock Transformations; durable ledger is mandatory and authoritative |
| Other DB readers/writers | sales, sessions/closeout, share links, stock wallets, service jobs, and follow-up queries use ProductVariant as both choice and unit | Replace | Rebind commercial selection to Sellable Offering/Snapshot; bind Product stock operations to Balance Source; Service operations remain inventory-free |
| Legacy Service bridge | legacy Service ids and `legacy-service-operations-migration.ts` preserve the early dual representation | Delete | Clean Service Offering and Service Operations model only; no legacy ids, migration reader, or compatibility path |
| API schemas | create-product/catalog-item accepts `primaryUnitName`, `unitTemplateKey`, unit-like `variants`, floating `conversionMultiplier`, and integer stock; stock APIs accept ProductVariant ids | Replace | Separate catalog/variant/offering/unit-configuration contracts; exact decimals cross the API as strings; stock commands identify offering plus resolved Balance Source and Inventory Unit |
| API routers | product/template/price endpoints and stock conversion route expose the bridge; sync union contains `unit_conversion_recorded` with variant ids | Replace | Generic offering endpoints, draft/publish unit configuration endpoints, exact stock commands, and version-aware offline events |
| Dashboard inventory | `inventory-data.ts` and `inventory-operations.ts` flatten ProductVariants into unit rows, read metadata ratios, calculate base equivalents with JavaScript numbers, and treat conversion pairs as variant movements | Replace | Balance Source rows, exact formatted quantities, shared-pool availability, Packaged Stock, and explicit transformation views |
| Dashboard catalog | catalog creation presents variant conversion multiplier and sends a unit-shaped variant payload | Replace | Simple Catalog Item flow with advanced Variant, Offering, and Product Unit configuration sections |
| Mobile catalog | `first-product-setup-sheet.tsx` hardcodes feed presets and represents units as locally stocked variants | Replace | Neutral progressive Product setup; Service setup has no unit controls; advanced Product configuration uses Unit Definitions and exact factors |
| Mobile inventory | intake, closeout, clock-in, sale, sharing, and conversion sheets identify local/remote variants as units | Replace | Local Offering ids and Balance Source ids are distinct; exact quantities and configuration versions are carried explicitly |
| Mobile offline store | `retailOpsStore.ts` keeps stock on the product/default variant and each variant, uses number multipliers, and creates paired `conversion_in`/`conversion_out` events | Delete and replace | Bump/reset the local schema; discard old queued events and caches; introduce exact serialized quantities, offerings, configurations, balances, and atomic transformation payloads |
| Mobile sync | `retail-ops-sync.ts` maps local unit ids to remote ProductVariant ids and reconstructs conversions from paired movements | Delete and replace | New event version only, with no reader for old events; sync authoritative offering/balance/configuration identities and server conflict results |
| Storefront/share links | product pages and order forms submit ProductVariant as the selected unit | Replace | Public storefront selects Sellable Offering; Product order snapshots retain unit meaning without exposing inventory structure |
| Conversion utility | `packages/utils/src/inventory-unit-conversion.ts` uses binary floating point, epsilon comparison, and whole output only | Delete | Exact decimal/rational domain operations implementing publication representability and transaction precision rules |
| Seeds/reference data | reference-data seed installs bag fractions and 25 kg/50 kg feed templates | Delete | Seed neutral Unit Definitions only; no factors, products, industries, or automatic templates |
| Validation/scripts | workflow and mobile check scripts require bag/half-bag/quarter-bag presets and variant conversion behavior | Delete and replace | Generic fixtures covering piece/carton, mass, length, liquid, shared pool, Packaged Stock, variants, and Services |
| Tests | DB/API/dashboard/mobile tests assert fallback templates, multipliers, InventoryItem-per-unit, or feed/bag UI | Delete and replace | Domain invariant, exact arithmetic, subtype, authorization, offline conflict, ledger balance, and end-to-end neutral scenario tests |
| Generated Prisma output | generated client contains the old models and fields | Regenerate | Never edit generated files; regenerate only after the replacement schema is complete |
| Migration history | the current unit-template/ratio migration establishes the rejected bridge | Replace during clean reset | Use the repository-approved destructive early-stage schema reset; do not add a preservation/backfill migration |
| Brain active contracts | API, schema, merchant module, feature, workflow, and ADR-0010 describe variants as unit buckets and feed presets | Replace or supersede | Update active docs to the resolved language and add a superseding ADR; historical progress/intake may remain clearly historical but cannot define current behavior |

### Concrete old surfaces found

- Schema: `packages/db/prisma/models/commerce.prisma`,
  `packages/db/prisma/models/pos.prisma`,
  `packages/db/prisma/models/share-links.prisma`, and
  `packages/db/prisma/models/service-operations.prisma`.
- Catalog and stock repositories:
  `packages/db/src/queries/retail-ops-products.ts`,
  `retail-ops-stock.ts`, `retail-ops-sales.ts`,
  `retail-ops-sessions.ts`, `retail-ops-stock-wallets.ts`,
  `retail-ops-share-links.ts`, and `retail-ops-service-jobs.ts`.
- API: `apps/api/src/schemas/retail-ops.ts` and the product, stock,
  sales, staff, follow-up, and aggregate Retail Ops routers.
- Dashboard: catalog item creation, inventory page/data/operations, and the
  inventory API route.
- Mobile: first-product setup, unit conversion, stock intake, closeout,
  clock-in, product sharing, local Retail Ops store, and Retail Ops sync.
- Public commerce: storefront shared-product lookup/order form and the
  share-link query path.
- Data and checks: reference-data seed, Retail Ops workflow validation,
  live validation, mobile flow checks, conversion utility, and their tests.
- Active Brain sources:
  `.brain/api/contracts.md`, `.brain/database/schema.md`,
  `.brain/features/mobile-retail-ops-mvp-spec.md`,
  `.brain/modules/merchant-system.md`,
  `.brain/workflows/retail-ops-stock-to-closeout-flow.md`, and
  `.brain/decisions/ADR-0010-server-owned-stock-unit-conversions.md`.

### Old flow traces

1. **Create**: dashboard/mobile submits unit-shaped variants and optional
   template/multiplier data; API validates JavaScript numbers; repository
   creates ProductVariant + InventoryItem pairs and duplicates ratio/price
   facts into relational fields and metadata.
2. **Receive/count/assign**: stock commands address a ProductVariant, then
   mutate its independent integer InventoryItem or staff wallet. Closeout
   declarations repeat the same conflation.
3. **Convert**: client previews using floating multipliers; server derives a
   whole output from ProductVariant ratios; source and target InventoryItems
   are mutated; paired movements cross-reference two variants.
4. **Sell/share**: POS or storefront selects ProductVariant; price and stock
   both resolve through it; OrderItem snapshots the name/SKU/price but not an
   explicit offering/configuration/balance contract.
5. **Offline replay**: the local store treats variants as unit buckets, queues
   variant-id events, and the sync layer reconstructs paired conversions.
   These events cannot be safely interpreted under the new model and must be
   discarded during the clean reset.

### Neutral behavior to retain

- Tenant/business and Store authorization boundaries.
- Immutable commercial snapshots and immutable stock-ledger history as
  principles, implemented with the new identities.
- Idempotency keys for external/offline commands.
- Product stock exclusion for Services.
- Non-negative stock enforcement, transactional postings, and explicit
  reason/actor/timestamp audit data.
- Separate current price from historical order price, moved to Sellable
  Offerings and Price Changes.
- Public storefront capability on the storefront surface; authenticated
  business dashboards remain on the primary application host.

### Clean-cutover search gates

After implementation, repository searches must find no runtime occurrence of:

- `feed_bag_25kg`, `feed_bag_50kg`, `bag_fractions`, `half_bag`, or
  `quarter_bag`;
- `ProductUnitTemplate`, `ProductUnitTemplateUnit`, `unitTemplateKey`,
  `conversionMultiplier`, `conversionRatioNumerator`, or
  `conversionRatioDenominator`;
- ProductVariant used as an Inventory Unit or InventoryItem used as one
  unit-per-variant stock;
- missing-table fallback readers, metadata dual writes, legacy Service ids, or
  old offline event compatibility;
- user-facing instructions that create “half bag” or “quarter bag” variants.

ProductVariant may remain only if it is the renamed/retained physical table for
the resolved Sellable Variant concept and contains no unit, balance, offering,
price, SKU, or conversion responsibility. The schema-design issue will decide
whether a clean rename is clearer.
