## Parent map

[Wayfinder: Product Image Marketplace and Storefront Publishing](https://github.com/ishaqyusuf/ewatrade/issues/5)

## Blocked by

[Decide marketplace and gallery image search behavior](https://github.com/ishaqyusuf/ewatrade/issues/9)
[Decide token wallet and image transaction rules](https://github.com/ishaqyusuf/ewatrade/issues/7)
[Decide AI image refinement lifecycle and pricing](https://github.com/ishaqyusuf/ewatrade/issues/10)
[Decide minimal product-create publish flow](https://github.com/ishaqyusuf/ewatrade/issues/11)

## Status

resolved

## Question

What concrete product-create image picker flow should merchants react to before the implementation spec is written?

Prototype a rough mobile-first flow that covers:

- Title entry causing marketplace/galleries search.
- The "We found X images for your product" button.
- Marketplace image list with per-image token price.
- Own gallery search filtered by title/category.
- Local gallery upload and camera capture.
- Optional "Refine - X tokens" action and insufficient-token recovery.
- Publish-image-to-marketplace checkbox plus first-time default-setting bottom sheet.
- Save/Publish with draft/published/scheduled product status.

## Prototype Artifact

### Product Create Screen

1. Merchant enters product title.
2. After debounce, an image row appears: `We found 12 images for this product`.
3. Merchant can continue without image, tap found images, upload, or use camera.

### Image Picker Sheet

- Tabs: Marketplace, Your gallery, Upload, Camera.
- Marketplace cards show image, token price, license label, quality badge, and `Use - X tokens`.
- Gallery cards show free/owned labels and previous product/category context.
- Upload and Camera create private draft assets first.

### Token Recovery

- If balance is insufficient, show required tokens, current balance, and top-up options.
- Merchant can return to product draft without losing title/category/price input.

### Refinement

- Selected merchant-owned or licensed copy shows `Refine - X tokens`.
- Refinement creates a preview result with Accept, Retry, Keep original.
- Accepted result becomes selected product image and remains linked to original.

### Marketplace Consent

- Near Save/Publish, show `Publish this image to the Product Image Marketplace` only for eligible merchant-owned/refined images.
- First opt-in opens a bottom sheet explaining reuse license, future purchases, unpublish behavior, and store default.

### Save/Publish

- Save as Draft allows no image or pending token/refinement state.
- Publish requires valid product sale fields and an image state that is either absent, owned, licensed, or accepted refinement.
- Schedule publish stores desired publish time and keeps storefront hidden until then.
