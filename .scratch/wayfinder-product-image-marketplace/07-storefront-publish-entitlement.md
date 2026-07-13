## Parent map

[Wayfinder: Product Image Marketplace and Storefront Publishing](https://github.com/ishaqyusuf/ewatrade/issues/5)

## Blocked by

None - can start immediately.

## Status

resolved

## Question

What is the MVP boundary for the paid "Publish Site" feature using existing `Store`, `Site`, `Page`, `Template`, `Theme`, and `TenantHostname` primitives?

Resolve at least:

- Whether the paid entitlement belongs to `Tenant` or individual `Store`.
- Whether every `Store` gets an auto-reserved subdomain at setup or only when publishing.
- How slug availability, collisions, reserved words, and later slug changes are handled.
- What a published storefront includes at MVP: product grid, product detail, order placement, contact/WhatsApp flow, SEO metadata, and stock visibility.
- How the hidden-until-shared subdomain should behave before publish.
- Whether publish site is monthly subscription only, token-gated, trial-gated, or bundled into an existing plan.
- What remains explicitly later: custom domains, templates, branding, and direct payment acceptance.

## Resolution

- Publish Site entitlement belongs to `Store`, while billing/subscription ownership remains `Tenant`.
- Reserve a candidate subdomain/slug when the store is created, but only create the public hostname/site as live when publishing succeeds.
- Slug collisions append a short suffix. Reserved words and platform names are blocked. Later slug changes create redirect/alias policy only after the first MVP; v1 can require support intervention.
- MVP published storefront includes product grid, product detail, product images, prices, availability labels, contact/WhatsApp CTA, and shared-product/order-request flow where enabled. Direct online payment is later.
- Before publish, the subdomain should not show a public storefront. It may show a private preview to authenticated owners/admins.
- Publish Site should be a plan/entitlement feature, not token-gated. Free trial or plan bundle can grant store-level publish rights.
- Later: custom domains, rich template marketplace, advanced branding, direct payment acceptance, SEO automation depth, and multi-theme storefront builder.
