# 09 - Decide API, Schema, Offline Sync, And Migration Impact

## Question

What backend, schema, API, offline replay, and migration changes are required to support the redesigned item form safely?

**Type:** Research.

**Blocked by:** [Decide product, unit, variant, and sellable option language](03-decide-product-unit-variant-and-sellable-option-language.md); [Decide suggestion library governance and privacy rules](08-decide-suggestion-library-governance-and-privacy-rules.md); [Decide variant price, stock, enable, and expansion matrix](06-decide-variant-price-stock-enable-and-expansion-matrix.md).

## Resolve By

- Decide whether to extend `retailOps.createProduct` or introduce separate product draft, variant type, variant value, and combination procedures.
- Decide schema changes, if any, for variant labels, values, generated combinations, image galleries, image links, suggestion aggregates, and per-variant media.
- Decide offline envelope changes for item drafts, image local URIs, link rows, variant values, and combination price/stock rows.
- Decide how existing products with current primary/variant rows migrate or display in the new form.
- Decide tenant, role, entitlement, and audit checks for creating/editing item fields, variants, images, and suggestions.
- Decide tests needed for schema, query modules, API schemas, mobile local store replay, sale/stock/report compatibility, and migration fallback.

## Context

The current production bridge already creates a product, primary unit variant, optional variant/sub-unit rows, price-history entries, inventory items, and opening-stock movements. The new UX may only require a better mobile form, but multi-dimensional variants and shared suggestions may require durable schema work.

## Resolution

No Prisma migration is required for this slice. `retailOps.createProduct`, mobile local store, offline replay, and DB query metadata now carry product `imageLinks`, variant `enabled`, variant `imageUrl`/`imageLinks`, and `variantLabel`. Multiple dimension combinations are saved as normal `ProductVariant` rows with combined names and metadata.
