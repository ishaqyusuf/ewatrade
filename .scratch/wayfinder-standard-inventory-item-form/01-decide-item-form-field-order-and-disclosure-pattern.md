# 01 - Decide Item Form Field Order And Disclosure Pattern

## Question

What should the standard mobile Add/Edit Item form ask for, in what order, and which fields stay hidden until requested so a new merchant can create an item without confusion?

**Type:** Grilling / prototype.

**Blocked by:** None.

## Resolve By

- Decide the first-screen field sequence for a new item: item name, optional description trigger, image card, optional image links, single price, default unit, variant question, and save behavior.
- Decide which fields are required for first save versus optional enrichment.
- Decide how Edit Item differs from Add Item without introducing a separate mental model.
- Decide whether the first-product onboarding flow and later Add Item flow use the same component and state model.
- Decide how the form communicates that a single price will be disabled after variants with their own prices are saved.

## Context

The user wants item name to be primary, description optional behind Add Description, image entry visual and optional, and price obvious before variants. The current first-product setup already exists, but the new flow should feel like a standard inventory system rather than a setup-only wizard.

## Resolution

Implemented in `apps/mobile/src/components/mobile/first-product-setup-sheet.tsx`.
The item form now orders fields as item name, optional description, product image/media, default unit and price, variant question, variant rows, and stock confirmation. The single price is disabled once enabled variant rows or generated combination rows own pricing.
