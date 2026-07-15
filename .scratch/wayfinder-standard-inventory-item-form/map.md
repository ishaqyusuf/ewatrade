# Wayfinder: Standard Inventory Item Form

## Destination

Create a handoff-ready product and implementation blueprint for a standard mobile inventory item form in EwaTrade. The way is clear when the team can specify the new Add/Edit Item flow, optional description and image entry, default unit setup, variant type search/creation, variant value management, per-variant price and stock rows, offline behavior, and the required API/schema changes without guessing.

This map is planning only. It should resolve decisions and prepare implementation tickets, not change product code.

## Notes

- Use this scratch directory: `.scratch/wayfinder-standard-inventory-item-form/`.
- The user-facing word can be `item`, but the current domain model uses `Product` for the catalog parent and `ProductVariant` for sellable units/options. One ticket must decide whether the existing bridge can represent multiple variant dimensions or whether a new normalized option/value/combo layer is needed.
- Current foundation already includes `retailOps.createProduct`, `retailOps.unitTemplates`, product descriptions, product units, variants/sub-units, inventory items, price history, effective sale-time price snapshots, opening-stock movements, and offline product setup replay.
- Relevant Brain docs: `.brain/features/mobile-retail-ops-mvp-spec.md`, `.brain/features/retail-ops-sales-product.md`, `.brain/plans/2026-07-06-feature-flexible-product-units-and-price-history.md`, `.brain/database/schema.md`, `.brain/database/relationships.md`, `.brain/api/contracts.md`, and `.brain/api/permissions.md`.
- UX references: EwaTrade mobile customer search in `apps/mobile/src/components/mobile/create-sale-sheet.tsx` and `apps/mobile/src/components/mobile/customer-book-sheet.tsx`; GND selector reference in `/Users/M1PRO/Documents/code/_turbo/gnd/apps/dealership/src/components/dealer-sales-form/dealer-customer-selector-dialog.tsx`; GND mobile invoice-form prompt at `/Users/M1PRO/Documents/code/_turbo/gnd/google-ai-studio-mobile-invoice-form-prompt.txt`.
- Mobile UX should stay NativeWind-first, keyboard-safe, virtualized for long lists, and consistent with existing EwaTrade mobile primitives such as `FormField`, `ActionButton`, `EmptyState`, status badges/banners, bottom-sheet input providers, and full-screen modal routes where long search/edit flows need space.
- The target merchant experience is simple first: item name is required; description is hidden behind Add Description; image is optional through a camera/image card plus optional image links; single price remains active until variants are saved; variant rows then own price and stock.
- Suggestion credibility rule from the user: custom variant labels/values may be suggested from a business's own history immediately, but cross-business suggestions should appear only after at least 2 businesses have used the same normalized input. The threshold should be configurable later to 5 or more.

## Tickets

- [x] [Decide item form field order and disclosure pattern](01-decide-item-form-field-order-and-disclosure-pattern.md)
- [x] [Decide description and product image entry behavior](02-decide-description-and-product-image-entry-behavior.md)
- [x] [Decide product, unit, variant, and sellable option language](03-decide-product-unit-variant-and-sellable-option-language.md)
- [x] [Design variant type search and creation modal](04-design-variant-type-search-and-creation-modal.md)
- [x] [Design variant values editor](05-design-variant-values-editor.md)
- [x] [Decide variant price, stock, enable, and expansion matrix](06-decide-variant-price-stock-enable-and-expansion-matrix.md)
- [x] [Decide default unit and unit suggestion behavior](07-decide-default-unit-and-unit-suggestion-behavior.md)
- [x] [Decide suggestion library governance and privacy rules](08-decide-suggestion-library-governance-and-privacy-rules.md)
- [x] [Decide API, schema, offline sync, and migration impact](09-decide-api-schema-offline-sync-and-migration-impact.md)
- [x] [Assemble final implementation spec and QA gates](10-assemble-final-implementation-spec-and-qa-gates.md)

## Decisions so far

- The first implementation uses the existing first-product setup surface as the shared standard item form foundation.
- Item name, primary unit, and either a single price or enabled variant rows are required. Description, camera/gallery image, public image links, unit templates, and variant images are optional.
- Public image links persist through the API/offline sync as metadata-backed `imageLinks`; local camera/gallery URIs remain device-local until durable upload storage is selected.
- User-facing `item` maps to `Product`; default unit and sellable values map to `ProductVariant`; opening stock maps to `InventoryItem` plus existing opening-stock movement behavior.
- One variant label maps directly to variant rows. Multiple variant labels generate sellable combination row names, for example `Color Red, Size SM`, and still persist as `ProductVariant` rows with combined `variantLabel` metadata.
- Variant suggestions ship as a local known-list plus typed creation. Cross-business suggestion aggregation is deferred to a durable service with the user-requested credibility threshold before suggestions can be shared across businesses.
- No Prisma migration is required for this slice; product/variant image links, enabled state, and variant labels are metadata-backed and covered by schema/query/store/sync tests.

## Not yet specified

- Durable upload provider and remote persistence for local camera/gallery images.
- Durable tenant-local and cross-business suggestion service, including normalization aliases, moderation, retention, and configurable credibility threshold.
- Exact migration and rollout sequence for existing products that already have variants/sub-units.
- Later catalog edit flow parity beyond first-product setup.

## Out of scope

- Implementing the redesigned item form, schema changes, migrations, API procedures, or mobile screens inside this Wayfinder map.
- Replacing the broader Retail Ops product, sales, inventory, customer book, share-link, or sync architecture.
- Building the Product Image Marketplace, AI image refinement, token wallet, or paid storefront publishing flow; those live in `.scratch/wayfinder-product-image-marketplace/`.
- Choosing final cloud storage, AI, payment, or billing providers unless a later ticket proves the item form spec cannot proceed without a narrow provider decision.
- Full customer marketplace browsing, native customer checkout, ERP purchasing, or advanced inventory costing.
