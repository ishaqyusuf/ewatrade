## Parent map

[Wayfinder: Product Image Marketplace and Storefront Publishing](https://github.com/ishaqyusuf/ewatrade/issues/5)

## Blocked by

None - can start immediately.

## Status

resolved

## Question

How should product-title-driven image discovery search the public marketplace and the merchant's own image gallery during product creation?

Resolve at least:

- What triggers search from the entered product title and category metadata.
- What "We found X images for your product" counts and when the button appears.
- How marketplace results, the merchant's own past images, and local upload/camera actions are separated in the UI.
- What matching signals are allowed: title text, category, tags, image embeddings, product metadata, merchant location, popularity, or manual curation.
- How prices are shown per marketplace image and how free/owned images are distinguished.
- How duplicate, low-quality, private, deleted, or already-used images are filtered.
- What privacy boundary prevents one merchant from seeing non-published images from another merchant.

## Resolution

- Search triggers after the product title has at least three meaningful characters and again when category/tags change, with debounced results.
- The "We found X images for your product" button counts searchable marketplace listings plus the current tenant/store's own gallery matches. It appears only when results exist and the merchant has not already selected an image.
- Results are separated into tabs/sections: Marketplace, Your gallery, Upload, Camera.
- Allowed matching signals for MVP: normalized title tokens, category, merchant-entered tags, product metadata, marketplace listing tags, image quality score, usage/popularity, and manual curation flags. Embeddings can be a later ranking signal after moderation and cost controls exist.
- Marketplace cards show token price, license label, source quality/status, and whether the merchant already owns a license. Own-gallery cards show free/owned.
- Filter out private images from other stores, unpublished listings, deleted/suspended listings, duplicate asset hashes, low-quality/rejected images, unsafe moderation states, and images already attached to the current product unless the merchant is replacing/reusing.
- Privacy rule: a store can see its own images and globally published marketplace listings only. Tenant-private images never appear in another tenant's search.
