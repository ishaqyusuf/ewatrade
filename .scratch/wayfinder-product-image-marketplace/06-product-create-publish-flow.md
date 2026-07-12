## Parent map

[Wayfinder: Product Image Marketplace and Storefront Publishing](https://github.com/ishaqyusuf/ewatrade/issues/5)

## Blocked by

None - can start immediately.

## Question

What is the minimal product-create flow that feels e-commerce-ready while keeping required input simple and making category, metadata, images, stock quantity, variants, publish status, and scheduled publishing optional but discoverable?

Resolve at least:

- Required fields for first save versus publish.
- How status should work across draft, published, scheduled, and unpublished states.
- Where stock quantity and variant/unit setup fit with the existing `Product` and `ProductVariant` model.
- How the image marketplace opt-in checkbox appears before Publish/Save without interrupting the core flow.
- What happens when the merchant saves a product with no image, an unrefined image, a refined image, an owned gallery image, or a paid marketplace image.
- How first-time marketplace opt-in confirmation is persisted and how it can be changed later in business settings.
