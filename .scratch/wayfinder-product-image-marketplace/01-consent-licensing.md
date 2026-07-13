## Parent map

[Wayfinder: Product Image Marketplace and Storefront Publishing](https://github.com/ishaqyusuf/ewatrade/issues/5)

## Blocked by

None - can start immediately.

## Status

resolved

## Question

What are the consent, ownership, licensing, revocation, attribution, and payout rules for publishing a merchant's product image to the Product Image Marketplace so another `Store` can spend tokens to use it?

Resolve at least:

- What the checkbox "Publish image to the Product Image Marketplace" legally and product-wise grants.
- Whether a marketplace buyer gets one-time use, reusable use, derivative/refinement rights, or a copied asset.
- Whether the source merchant can unpublish an image after other stores have used it, and what happens to prior uses.
- Whether merchant name/website attribution is required, hidden, or optional for image reuse.
- How the first-time "always publish my images" bottom sheet should set and describe the persistent `Store` or `Tenant` preference.
- What events must be auditable for publish, purchase/use, unpublish, refund, dispute, and payout.

## Resolution

- The checkbox grants Ewatrade permission to list the selected image in the Product Image Marketplace and let other stores license a copied derivative asset for product presentation inside Ewatrade surfaces.
- Marketplace buyers receive a copied asset usage license for their own store/product listings, not ownership of the original image and not permission to resell the asset outside Ewatrade.
- Buyers may use the copied asset repeatedly inside the purchasing store. Cross-store reuse requires another license unless the tenant-level policy later bundles multi-store use.
- AI refinement rights are explicit: a buyer may refine their licensed copy, but the refined copy cannot be republished to the marketplace unless Ewatrade later supports derivative-chain consent and revenue split.
- Source merchants can unpublish future availability. Prior licensed uses remain valid unless removed for policy, ownership, safety, or dispute reasons.
- Attribution is optional and hidden by default in merchant product surfaces; Ewatrade admin/support retains source lineage for disputes and payout support.
- The first-time "always publish my images" bottom sheet sets a store-level default with copy that says each future product image can still be individually unchecked before saving/publishing.
- Audit events: marketplace publish, default opt-in changed, purchase/license, asset copied, refinement requested, unpublish, hide/suspend, dispute opened/resolved, refund, payout accrued, payout reversed.
