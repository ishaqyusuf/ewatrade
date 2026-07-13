## Destination

Find the spec boundary for a Product Image Marketplace and Storefront Publishing upgrade to Retail Ops. The way is clear when the team can write an implementation spec for product creation image discovery, token spend/earn/purchase flows, optional AI product-image refinement, image marketplace publishing consent/defaults, and paid per-store storefront publishing on an auto-created subdomain.

## Notes

- Planning only. This map should resolve decisions and produce a spec-ready route, not implement the feature.
- Repo language: `Tenant` is the merchant/business account; `Store` is the per-business or sub-business unit; `Product` and `ProductVariant` are the catalog records; `Site`, `Page`, `Theme`, `Template`, and `TenantHostname` already cover storefront publishing primitives.
- Consult `.brain/database/schema.md`, `.brain/database/relationships.md`, `.brain/modules/marketplace.md`, `.brain/modules/website-builder.md`, `packages/db/prisma/models/commerce.prisma`, `packages/db/prisma/models/storefront.prisma`, `packages/db/prisma/models/base.prisma`, and `packages/db/prisma/models/billing.prisma`.
- Preserve the existing rule that public marketplace data must be explicitly flagged for exposure.
- Token pricing, provider path, marketplace image licensing, and AI refinement policy are now resolved at Wayfinder level; implementation specs still need exact provider configuration, pricing values, and legal copy.

## Decisions so far

- Marketplace image publishing grants Ewatrade a reusable in-platform license listing, while buyers receive a copied asset license for their own store/product use.
- Token balances belong to tenant billing ownership with store attribution on ledger entries.
- Native iOS/Android token top-ups should use Apple/Google billing paths for digital image tokens; local bank/fintech checkout is appropriate for web/dashboard or non-digital contexts.
- Product-title image discovery searches marketplace listings and the merchant's own gallery, never another tenant's private images.
- AI refinement runs on merchant-owned or licensed copies, uses token holds, requires merchant acceptance, and preserves original/refined lineage.
- Product create stays simple: title first, image optional, stock/variants/publish controls discoverable, marketplace consent explicit.
- Publish Site is a store-level entitlement under tenant billing, not token-gated.
- Marketplace moderation uses pre-listing automated checks, report/dispute workflows, listing states, and audit-backed refunds/reversals.
- The prototype flow is a mobile-first image picker with Marketplace, Your gallery, Upload, Camera, optional refinement, token recovery, consent, and Draft/Publish/Schedule outcomes.

## Not yet specified

- Final implementation spec and tracer-bullet ticket breakdown.
- Exact database migration sequence for product image assets, marketplace listings, license purchases, token wallet/ledger rows, top-up sessions, holds, disputes, and refinement jobs.
- Provider choices for storage, moderation, AI refinement, Apple/Google IAP products, and web/dashboard payment processors.
- Final UI copy, legal terms, tax/accounting treatment, and support operations process.
- Storefront template/branding roadmap beyond the first paid publish-site MVP boundary.

## Out of scope

- Charging merchants tokens to share product links; sharing links stays free for this effort.
- Custom merchant domains, rich template marketplace, direct buyer-to-merchant payment setup, and advanced storefront branding beyond what is needed to define the first paid publish-site MVP.
- Implementing schema, API, mobile UI, storefront UI, billing adapters, or AI jobs inside this Wayfinder map.
