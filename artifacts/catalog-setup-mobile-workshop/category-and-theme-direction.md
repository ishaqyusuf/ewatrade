# Category and theme direction — selected mobile Direction 02

1 October 2026. Scope: working workshop and reusable suggestion config. Native UI, HTTP APIs and database migration are not implemented in this iteration.

## Category interaction

1. Category is optional under More details. New products start Uncategorized; no suggestion assigns a category automatically.
2. Open the picker: Used in your catalog first, Your categories when present, then business-profile suggestions. All categories and global search remain available. Search also matches subcategory names.
3. Select a category, such as Poultry. A focused subcategory screen offers Eggs, Live birds, Dressed poultry and Hatching eggs. Poultry only is a valid selection.
4. Use this category commits the draft and returns the readable Poultry › Eggs summary. Back and Keep current category preserve the previous assignment. Uncategorized clears both category and subcategory.
5. Add your own category/subcategory creates reusable local preview entries. Names are bounded to 80 characters, normalised, and duplicate sibling names reuse the existing entry. Choosing another parent clears the staged child.

Used-category counts are sample facts. Native implementation must query scoped existing Catalog assignments, including merchant-created names and preserved legacy categories. Prefer recently used categories, using count as a secondary signal; show the selected path explicitly rather than preselecting it. Repeated preset roots are omitted from Suggested when already shown in Used. Business type ranks suggestions only; it never authorizes or limits operations.

## One shared constant config

`packages/utils/src/catalog-category-presets.json` is schema version 1: 22 expandable starter categories and 88 subcategories. Root entries have stable key, label, itemKinds, businessProfileKeys and subcategories with stable keys/labels. Business keys reuse the existing 15-profile library. These are defaults, not an exhaustive global catalog. Custom merchant vocabulary is required.

`@ewatrade/utils/catalog-category-presets` exports the validated, deeply immutable CATALOG_CATEGORY_CONFIG and CATALOG_CATEGORY_PRESETS plus lookup/suggestion functions. The browser workshop bundles this same module; there is no separate mobile/web category list. The profile picker likewise uses existing BUSINESS_PROFILES. Config keys are identity; labels can change without reassignment.

To rebuild the workshop bundle after changing source:

```sh
bun build artifacts/catalog-setup-mobile-workshop/category-library-entry.ts --target=browser --format=iife --outfile=artifacts/catalog-setup-mobile-workshop/category-library.js
```

Business/category mapping is visible in category-config-reference.html. Product and Service vocabulary share the config but retain their explicit kind semantics. No suggested category grants regulated capabilities, changes stock, or publishes an item.

## Database direction for later implementation

Current CatalogItem.category is a nullable string. No Catalog category/subcategory hierarchy models exist. The existing StockOperationCategoryName/StockOperationCategory models classify inventory operations and must not be repurposed for Catalog browsing.

Propose tenant-owned Category and Subcategory records with stable IDs, normalised names, immutable tenant-local slugs, optional preset keys and archival state. A subcategory belongs to exactly one category in the same Tenant. An item can choose a category alone or a subcategory belonging to it. Parent/child assignments must be validated transactionally and enforced with same-Tenant foreign keys and same-parent constraints. The exact physical FK/nullable constraint shape is implementation work, not a schema claim.

Null means Uncategorized; do not create a shared catch-all Uncategorized row or force an Other category. Seed vocabulary suggests labels; create/reuse tenant records only after explicit selection/save. Legacy non-empty category strings should become tenant-owned root labels without guessing a subcategory. Preserve compatibility for existing list/search/public DTOs until the transition is complete; do not drop the string field prematurely.

Use existing Catalog create/edit permissions and tenant repositories. Category creation, assignment and product save need atomic/idempotent semantics and uniqueness per parent, normalised name and Tenant. Suggestions return bounded results with active Store/tenant scope and authoritative counts; clients never aggregate another merchant’s categories. Never infer hierarchy from delimiter-separated category strings.

For storefront, project only active category paths with actually published items and valid Store availability. Group/navigation should derive from stable IDs/slugs, not display text. Assigning a category does not publish an item or expose private draft counts. Reuse labels for facets; categories do not replace customer options or inventory units.

No Prisma files were changed. The later Prisma update must use the repository’s generated migration workflow and run both required migrate/push commands; no manual migration SQL.

## Verified palette sources and semantic colors

The currently selected marketing experience is shop-v3. `apps/marketing/src/components/marketing/experiences/shop-v3.css` defines ink #30352D and rust accent #AE4723; primary landing buttons use ink, and their hover/emphasis uses rust. This landing palette is not the previous workshop’s mint.

Classic mobile THEME defines light primary #0D5E52 and dark primary #2DD4BF. Its dark accent is #404040 with light accent foreground. Market Day separately defines palm #17684F; its dark accentInk/marigold is #FFCA56. Preserve that distinction rather than treating every existing green/yellow value as one primary token.

The workshop offers three palettes while holding layout and neutral surfaces constant:

| Palette | Light primary / on-primary | Dark primary / on-primary | Dark accent surface / foreground |
| --- | --- | --- | --- |
| Landing-inspired rust | #AE4723 / #FFFFFF | #E9A483 / #301C14 | #382B24 / #E9A483 |
| Brand green | #17684F / #FFF9ED | #8CD5B5 / #10271D | #26372D / #8CD5B5 |
| Original workshop teal | #0D5E52 / #F0FDFA | #61D0B5 / #042F2E | #293930 / #61D0B5 |

Dark rust and green are proposed lighter adaptations for legibility, not existing landing dark-mode tokens. The landing-inspired palette is the initial preview for this review, not a global theme approval.

All workshop color values live in theme-tokens.css. Components use semantic primary, primary-foreground, accent, accent-foreground, input, border, card and foreground variables; there are no hexadecimal/RGB color literals in workshop.css, workshop.js or category-flow.js. Color values necessarily exist once in the palette definition, not in individual controls.

For native implementation, use the existing semantic Tailwind/NativeWind classes (`bg-primary`, `text-primary-foreground`, `bg-accent`, `text-accent-foreground`, `border-border`, etc.). Imperative props such as icon/tint colors must use the existing `useColors()` export from hooks/use-color.ts. That hook reads THEME; NativeWind reads global.css/Tailwind variables. A selected palette must update both through one theme-definition/generation boundary and prove parity in light/dark, rather than updating only a hook or only CSS. Keep Market Day’s existing useMarketDayPalette and appearance provider compatible. Do not place inline hex values in a Catalog field, invent a second useColor hook or change unrelated screens silently.

The HTML reference cannot run the native hook. Its semantic CSS token names mirror the native structure; actual native hook/NativeWind integration remains part of implementation acceptance.


## Verified preview and Service reuse

Category interaction checks pass: earlier-used path, business-refined list, global child search, optional parent-only path, custom parent/child, cancellation, Uncategorized and readable Review. The Service companion reuses this picker while filtering presets to Service. Service history labels use services rather than products. Native hierarchy persistence is still pending.

Shared utility tests pass 6 tests / 29 assertions, utility TypeScript and scoped Biome pass. Primary/accent/body/muted token pairs pass 4.5:1 across all three palettes in light and dark (24 pairs). Both Product and Service consume the same centralized palette definitions. At the 390px browser override, Service's usable width and document width are both 375px (reserved vertical scrollbar); the business-selector overflow was fixed. No production theme was changed.
