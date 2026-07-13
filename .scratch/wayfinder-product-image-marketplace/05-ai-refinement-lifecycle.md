## Parent map

[Wayfinder: Product Image Marketplace and Storefront Publishing](https://github.com/ishaqyusuf/ewatrade/issues/5)

## Blocked by

[Decide token wallet and image transaction rules](https://github.com/ishaqyusuf/ewatrade/issues/7)

## Status

resolved

## Question

What lifecycle should optional AI image refinement follow from upload/selection through token charge, job processing, result acceptance, replacement, failure, and marketplace publishing eligibility?

Resolve at least:

- Whether refinement can run on local uploads, camera captures, owned gallery images, purchased marketplace images, or all of them.
- When the token debit happens and when it should be refunded.
- Whether the refined image automatically replaces the selected image or requires user acceptance.
- Whether both original and refined images remain in the merchant gallery.
- Whether refined images can be published to the Product Image Marketplace and who earns future tokens if the source was a purchased marketplace image.
- What moderation, storage, and retry behavior applies to failed or unsafe refinement jobs.

## Resolution

- Refinement can run on local uploads, camera captures, owned gallery images, and licensed marketplace copies. It runs against the merchant's copy, not the original marketplace asset.
- Create a token hold before the refinement job starts. Capture tokens only when a usable refined result is produced and accepted or auto-saved according to the chosen flow. Release/refund on provider failure, unsafe output, timeout, or user cancellation before processing starts.
- Refined images do not automatically replace the selected product image. The merchant previews and accepts the result.
- Keep both original and refined images in the merchant gallery with lineage metadata.
- Refined images from a merchant-owned original may be eligible for marketplace publishing after moderation and explicit consent. Refined images derived from purchased marketplace assets are not republishable in MVP.
- Failed jobs can be retried from the original input with a new hold only after the prior hold is released.
- Unsafe outputs are stored only as restricted moderation records where needed for audit, never as merchant-selectable gallery assets.
