# 02 - Decide Description And Product Image Entry Behavior

## Question

How should optional description, camera/image picking, image links, additional image rows, and row deletion work in the item form?

**Type:** Prototype.

**Blocked by:** [Decide item form field order and disclosure pattern](01-decide-item-form-field-order-and-disclosure-pattern.md).

## Resolve By

- Decide the Add Description collapsed/expanded state, placeholder copy, character limit, and whether empty descriptions are removed on save.
- Decide the image area card behavior: camera icon, tap target, camera versus gallery choice, loading/error states, and offline/local URI behavior.
- Decide the Add image link ghost button behavior, URL validation, row layout, Add more placement, and delete icon behavior per row.
- Decide whether product images and image links are stored together as one gallery concept or remain separate in the first implementation.
- Decide how variant-specific images later relate to the parent product image gallery.

## Context

The user asked for an image area card with a camera icon to pick an image or take a picture, a simple ghost Add image link button that reveals link input, and a bottom-right ghost Add more button where every link row has a delete icon.

## Resolution

Implemented in `apps/mobile/src/components/mobile/first-product-setup-sheet.tsx` and persisted through the product setup payload. Description is hidden behind Add Description and saved only when non-empty. Camera/gallery images are selectable locally; public image links can be added, removed, validated as HTTP(S), and replayed through API/offline sync.
