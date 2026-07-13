## Parent map

[Wayfinder: Product Image Marketplace and Storefront Publishing](https://github.com/ishaqyusuf/ewatrade/issues/5)

## Blocked by

None - can start immediately.

## Status

resolved

## Question

What does the current codebase already provide for this effort, and where are the durable schema, API, mobile, storefront, and background-job gaps?

Research at least:

- Existing catalog/product creation behavior in mobile and API.
- Existing image fields, metadata conventions, public exposure flags, and storage assumptions.
- Existing billing/subscription checkout abstractions and whether they can coexist with token top-ups.
- Existing storefront publishing primitives and tenant hostname resolution.
- Existing job/notification infrastructure that could run refinement or payment-confirmation work.
- A concise gap list that later spec/ticket work can reference without re-reading the whole repo.

## Research Summary

Existing support:

- Product creation already uses `Product`, `ProductVariant`, `InventoryItem`, price-history metadata, and Retail Ops API/mobile flows.
- `Product.description`, `Product.isPublished`, `Product.isMarketplaceListed`, `Product.metadata`, and shared-product storefront pages provide first public catalog hooks.
- Storefront primitives already exist: `Site`, `Page`, `PageSection`, `Theme`, `Template`, and `TenantHostname`.
- Billing foundations exist for `SubscriptionPlan`, `TenantSubscription`, `BillingCheckoutSession`, `BillingInvoice`, and `BillingProviderEvent`.
- Jobs/notifications packages already support background dispatch patterns that can later run refinement, moderation, and provider confirmation work.

Major gaps:

- No durable product image asset table, gallery table, marketplace listing table, license/purchase table, or image lineage model.
- No token wallet, token ledger, top-up sessions, holds, earned credit, payout, refund, or dispute ledger.
- No storage provider contract for product image uploads, derivatives, thumbnails, or moderation-restricted assets.
- No image marketplace search API, ranking, privacy filter, or moderation queue.
- No AI refinement job model, provider adapter, result acceptance flow, or refund path.
- No native/mobile product image picker flow beyond existing product setup.
- Storefront publish entitlement is not yet modeled per store, and hostname publication remains primitive-level rather than a productized paid feature.
- App-store payment policy means native token top-ups need Apple/Google billing paths; local bank checkout is mainly web/dashboard or non-digital contexts.
