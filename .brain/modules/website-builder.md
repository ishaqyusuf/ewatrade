
# Website Builder

Section-based website generator.

Structure:

Page
→ Sections
→ Section config
→ Theme tokens

Themes control:

- fonts
- colors
- spacing
- button styles

Templates combine sections into full site layouts.

## Publish Site Wayfinder

The product-image/storefront Wayfinder resolved the first paid Publish Site boundary:

- Publish Site is a store-level entitlement under tenant billing ownership.
- Candidate subdomains can be reserved at store setup, but public storefronts only become live after publish entitlement succeeds.
- Early EwaTrade production domain provisioning uses the existing `ewatrade-marketing` Vercel project for tenant storefront subdomains only. POS and dashboard subdomain registration is skipped until those Vercel projects exist.
- MVP storefronts include product grid, product detail, product images, price/availability labels, contact or WhatsApp CTA, and existing order-request flow where enabled.
- Custom domains, rich templates, advanced branding, and direct online payment acceptance remain later.

See `.brain/features/product-image-marketplace-and-storefront-publishing.md`.
