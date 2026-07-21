# Catalog Quick-Setup Helpers

## Status

Implemented on 2026-07-20 for dashboard and mobile Catalog item creation.

## Purpose

Give merchants an optional, editable starting point for common Product and
Service configurations without introducing database templates, business types,
industry-specific runtime branches, preset prices, or automatic saving.

## Shared Contract

- `@ewatrade/utils/catalog-setup-helpers` exports a versioned, immutable
  JSON-backed helper library, discriminated Product/Service types, key lookup,
  kind filtering, tag/title/description search, a platform-neutral prefill
  adapter, and a shared replacement-decision guard.
- Every helper has a stable key, kind, Setup/Example classification, title,
  description, tags, optional suggested item name, and a typed setup recipe.
- Product recipes define one factor-1 canonical unit, exact positive conversion
  factors, stock behavior, hidden transaction precision, and generic option
  groups.
- Service recipes define generic option groups, fixed/quote pricing, tracked or
  charge-only work, authorization policy, and hidden quantity precision.
- Helpers contain no tenant/store IDs, generated draft IDs, prices, identifiers,
  media, opening stock, or inventory balances.
- Runtime validation rejects duplicate keys, invalid factors or precision,
  Service inventory configuration, and recipes above Catalog combination or
  Offering limits.

## Starter Library

- Product Setups cover counted items, shared pack/carton selling units, weight,
  volume, length, and separately prepared whole/half/quarter packages.
- Product Examples cover 25 kg and 50 kg feed, apparel size/colour, bottle/crate
  drinks, and metre/roll fabric.
- Feed Examples use Bag as the canonical received balance and Half bag, Quarter
  bag, and Kilogram as Packaged Stock. Stock moves between them only through an
  explicit Stock Transformation; selling kilograms never opens a bag
  implicitly.
- Service Setups cover simple fixed-price, tracked fixed-price, and tracked
  quote-required work.
- Service Examples cover dry cleaning/laundry, device repair, and professional
  consultation.
- Dry cleaning/laundry creates generic Garment × Treatment × Size combinations.
  Each concrete Service Offering has its own editable selling price. Express
  service remains a Store-level Service Setting.

## Form Experience

- The Product/Service form begins with a full-width `Choose a quick setup`
  button on dashboard and mobile.
- The button opens a full-screen, searchable picker. It shows `Start blank`,
  then flat Setup and Example rows with a title, description, and tags. Search
  stays at the bottom of the screen, follows the keyboard through the shared
  keyboard controller, and matches the helper metadata. The scroll content
  reserves space for the search footer so the final rows remain reachable.
  Recommended recipes sort first and carry a visible recommendation badge.
- Applying a helper suggests its example name only when the item name is empty,
  preserves merchant-entered identity/base-price fields, and prefills editable
  units, exact factors, stock behavior, options, and Service policies.
- Unit editors present helper factors as merchant-facing relationships. Exact
  factors below one are transposed to counts such as `50 Kilograms in 1 Bag`,
  while larger selling units retain relationships such as `1 Pack contains 12
  Pieces`; submitting converts either direction back to the unchanged factor.
- Replacing populated structural work requires confirmation and clears
  incompatible combinations, unit-price overrides, and stock drafts.
- Product forms summarize every generated option combination in a flat list.
  Its menu opens a progressive compact-to-full-screen editor for current stock,
  price, description, image, SKU/barcode, Store availability, and optional
  additional-unit price overrides. Every persisted variant/unit Offering
  receives its resolved fixed price. Active Product variants require their own
  current-stock quantity, validated with the selected canonical unit's hidden
  precision on both clients.
- Service combinations are independently priceable. Quote-required helpers
  allow an optional starting price and preserve the existing Quote workflow.
- Quantity precision is intentionally hidden. Counted/discrete/service helpers
  use whole quantities; divisible units use two decimals. Blank/manual Products
  and newly added units default to two decimals.
- Helpers only prefill drafts. Merchants must review and submit through the
  existing Catalog APIs; no helper saves automatically.

## Compatibility

- No Prisma schema, migration, Catalog API contract, or authorization change is
  part of this feature.
- The removed `ProductUnitTemplate` model remains removed.
- Helper examples are static client-side recipes, never runtime domain branches.

## Verification

- Shared tests cover stable unique keys, searches, exact unit factors, canonical
  units, smart hidden precision, Catalog limits, feed stock semantics,
  dry-cleaning combinations, forbidden persisted values, platform-neutral
  prefills, dirty replacement decisions, and quote-to-fixed price requirements.
- Dashboard and mobile TypeScript checks and focused Biome checks cover the
  shared contract and both form integrations.
- Android hands-on QA confirmed the full-width Product form action, full-screen
  Setup/Example picker, metadata tags, and keyboard-safe bottom search.
