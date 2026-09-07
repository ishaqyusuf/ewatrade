# EWA-BIZ-005, Catalog list

Owner-review package for the next Market Day production screen.

The production route is `/(admin-tabs)/catalog`, rendered by
`CatalogItemsContent`. It loads paginated Product and Service listings, maps
truthful price and available-stock information, supports type filters, search,
pagination, refresh, offline behavior, and the five-position business dock.

## Current source-audited behavior

- The populated list uses a generic secondary header, All/Product/Service
  pills, an inline search field, standard operational rows, and a floating Add
  button.
- Product rows show available quantity and price. Service rows say `No
  inventory` and keep their price separate from Product stock.
- A settled empty Catalog replaces the list with a Product-or-Service first-item
  gate.
- Add opens `/first-product-setup-modal`, with direct Product and Service routes.
- Opening a populated row navigates to `/catalog-item/[catalogItemId]`. That
  full edit screen remains the dedicated `EWA-BIZ-006` batch; this package
  preserves the navigation contract but does not pre-select its redesign.

The authenticated runtime route could not pass its workspace access check while
the development server was unavailable. The archived before image is therefore
a source-audited 390 × 844 reconstruction of `CatalogItemsContent`, not a native
emulator claim.

## Included states

Every direction includes three switchable states in matched Light and Dark
themes:

1. populated Catalog list;
2. first Product-or-Service item gate;
3. Add item bottom sheet.

The comparison uses previous and next chevrons, not a select field.

## Five directions

1. **A, Market Stockbook**, recommended. A marigold stock ledger that makes
   Product/Service counts, low-stock pressure, item identity, price, and
   availability easy to scan. It is the strongest continuation from Dispatch
   Ledger and Dispatch Docket without becoming another Orders screen.
2. **B, Market Shelf**. A tactile two-column retail shelf with the strongest
   object identity. Best for smaller Catalogs, less efficient at high item
   counts.
3. **C, Open Price Board**. A deep-palm counter board with the fastest price
   scan and strongest shop-floor contrast. It is intentionally louder than the
   wider owner journey.
4. **D, Supply Route**. An action-led inventory view that promotes low-stock
   work before healthy listings. Strong for replenishment-heavy businesses,
   more prescriptive for price-editing workflows.
5. **E, Quiet Catalogue**. The calmest and most scalable list. Familiar and
   restrained, but less distinctive and less active about low stock.

## Evidence

- [Interactive comparison](./comparison.html)
- [Current source-audited screen](./current-state.png)
- [Desktop comparison board](./comparison.png)
- [Option A, Market Stockbook](./option-a.png) / [Dark](./option-a-dark.png)
- [Option A first-item gate](./option-a-first.png)
- [Option A Add item sheet](./option-a-add.png)
- [Option B, Market Shelf](./option-b.png) / [Dark](./option-b-dark.png)
- [Option C, Open Price Board](./option-c.png) / [Dark](./option-c-dark.png)
- [Option D, Supply Route](./option-d.png) / [Dark](./option-d-dark.png)
- [Option E, Quiet Catalogue](./option-e.png) / [Dark](./option-e-dark.png)
- [Mobile review page](./review-mobile.png)
- [Tablet review page](./review-tablet.png)
- [Desktop review page](./review-desktop.png)

## Verification

- Exactly one direction is visible at a time.
- Previous/next navigation advances and wraps through all five options.
- Catalog, First item, and Add item state switching works without page reload.
- Light/Dark switching preserves the active option and state.
- Options B and D received a second dark-mode contrast pass before review.
- The board was rendered at 375, 768, and 1440 pixel review widths.

## Owner gate

Status: **Awaiting owner selection.** No option is approved or authorized for
production implementation yet.

Recommendation: **Option A, Market Stockbook.**

<!-- implement-with-progress:start -->

## Implementation Progress

- Status: Owner Review
- Ticket Position: 12/38
- Completion: 46%
- Current Checklist: 6/13, present five directions and pause for owner selection
- Blockers: Explicit owner selection
- Brain Task: [Task](../../../../.brain/tasks/2026-09-07-catalog-list-design-review.md)
- Last Updated: 2026-09-07T09:28:00+01:00

<!-- implement-with-progress:end -->
