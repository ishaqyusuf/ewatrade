## Destination

Find the spec boundary for a Product Image Marketplace and Storefront Publishing upgrade to Retail Ops. The way is clear when the team can write an implementation spec for product creation image discovery, token spend/earn/purchase flows, optional AI product-image refinement, image marketplace publishing consent/defaults, and paid per-store storefront publishing on an auto-created subdomain.

## Notes

- Planning only. This map should resolve decisions and produce a spec-ready route, not implement the feature.
- Repo language: `Tenant` is the merchant/business account; `Store` is the per-business or sub-business unit; `Product` and `ProductVariant` are the catalog records; `Site`, `Page`, `Theme`, `Template`, and `TenantHostname` already cover storefront publishing primitives.
- Consult `.brain/database/schema.md`, `.brain/database/relationships.md`, `.brain/modules/marketplace.md`, `.brain/modules/website-builder.md`, `packages/db/prisma/models/commerce.prisma`, `packages/db/prisma/models/storefront.prisma`, `packages/db/prisma/models/base.prisma`, and `packages/db/prisma/models/billing.prisma`.
- Preserve the existing rule that public marketplace data must be explicitly flagged for exposure.
- Token pricing, provider choice, marketplace image licensing, and AI refinement policy are unresolved decisions, not assumptions.

## Decisions so far

## Not yet specified

- Final implementation spec and tracer-bullet ticket breakdown after the decision tickets close.
- Exact database migration sequence for product image assets, marketplace listings, token wallet/ledger rows, purchase sessions, and refinement jobs after lifecycle and token decisions are resolved.
- Exact mobile/web UI state machine and final copy after the product-create image flow, payment recovery, and marketplace opt-in behavior are chosen.
- AI image provider, storage, moderation, and generated/refined image policy after cost, quality, and consent constraints are settled.
- Storefront template/branding roadmap beyond the first paid publish-site MVP boundary.

## Out of scope

- Charging merchants tokens to share product links; sharing links stays free for this effort.
- Custom merchant domains, rich template marketplace, direct buyer-to-merchant payment setup, and advanced storefront branding beyond what is needed to define the first paid publish-site MVP.
- Implementing schema, API, mobile UI, storefront UI, billing adapters, or AI jobs inside this Wayfinder map.
