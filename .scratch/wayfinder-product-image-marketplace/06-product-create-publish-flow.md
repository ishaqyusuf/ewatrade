## Parent map

[Wayfinder: Product Image Marketplace and Storefront Publishing](https://github.com/ishaqyusuf/ewatrade/issues/5)

## Blocked by

None - can start immediately.

## Status

resolved

## Question

What is the minimal product-create flow that feels e-commerce-ready while keeping required input simple and making category, metadata, images, stock quantity, variants, publish status, and scheduled publishing optional but discoverable?

Resolve at least:

- Required fields for first save versus publish.
- How status should work across draft, published, scheduled, and unpublished states.
- Where stock quantity and variant/unit setup fit with the existing `Product` and `ProductVariant` model.
- How the image marketplace opt-in checkbox appears before Publish/Save without interrupting the core flow.
- What happens when the merchant saves a product with no image, an unrefined image, a refined image, an owned gallery image, or a paid marketplace image.
- How first-time marketplace opt-in confirmation is persisted and how it can be changed later in business settings.

## Resolution

- Required first-save fields: product title/name and at least one price or explicit "save as incomplete draft" state. Publish additionally requires price, active sale unit/variant, stock/availability choice, storefront visibility, and safe image state if an image is present.
- Product statuses: draft, published, scheduled, unpublished/archived. Scheduled products have a publish time and remain hidden until then.
- Stock quantity and variant/unit setup continue to use `Product`, `ProductVariant`, and `InventoryItem`; the image flow should not change inventory semantics.
- The image area is optional but discoverable: title entry can reveal found images, and upload/camera/gallery/marketplace actions live in one picker.
- The marketplace opt-in checkbox appears near Save/Publish when the selected image is merchant-owned or newly uploaded. It is disabled with explanatory copy for purchased marketplace images and unsafe/unreviewed assets.
- Saving without image is allowed. Saving with unrefined/refined/owned/paid images stores the selected asset reference and lineage. Paid marketplace images require completed license debit before publish but can leave the product as draft while payment is pending.
- First-time marketplace opt-in uses a bottom sheet explaining consent and a store-level default. Settings can later change the default without retroactively publishing or unpublishing existing images.
