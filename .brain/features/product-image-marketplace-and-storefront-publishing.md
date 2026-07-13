# Product Image Marketplace And Storefront Publishing

## Purpose
Define the resolved Wayfinder boundary for product image discovery, token-gated image reuse, AI refinement, and paid storefront publishing.

## Status
Wayfinder resolved. Implementation not started.

## Product Image Marketplace
- Merchants can explicitly publish eligible product images to an in-platform Product Image Marketplace.
- Buyers receive a copied asset license for use inside their own store/product listings, not ownership of the original asset and not resale rights.
- Source merchants can unpublish future availability, while prior licensed uses remain valid unless removed by policy/dispute.
- Attribution is optional and hidden by default in merchant storefronts, while source lineage remains available to support/admin workflows.
- Marketplace listings need moderation, reporting, dispute, refund, payout, and audit controls before launch.

## Token Wallet
- Token balances belong to the tenant billing owner, with store attribution on ledger entries.
- Purchased tokens, earned credits, holds, refunds, reversals, and admin adjustments are ledger events behind one spendable balance.
- Marketplace purchases and AI refinement use holds before final debit.
- Native iOS/Android token top-ups should use Apple/Google billing paths for digital image tokens. Web/dashboard top-ups can use normal provider checkout.

## Image Picker And AI Refinement
- Product-title search can find marketplace images plus the merchant's own gallery; it must never reveal another tenant's private images.
- The product-create picker uses Marketplace, Your gallery, Upload, and Camera paths.
- AI refinement runs on merchant-owned images or licensed copies, charges through token holds, preserves original/refined lineage, and requires merchant acceptance before replacement.
- Refined images derived from purchased marketplace assets are not republishable in the MVP.

## Publish Site
- Publish Site entitlement belongs to a store, under tenant billing/subscription ownership.
- A candidate subdomain can be reserved at store setup, but the public storefront becomes live only after publish entitlement succeeds.
- MVP storefront publishing includes product grid, product detail, product images, price/availability labels, contact or WhatsApp CTA, and existing order-request flow where enabled.
- Publish Site is plan/entitlement-gated, not token-gated.

## Deferred
- Exact schema and migration sequence for assets, licenses, token ledger, holds, disputes, payouts, refinement jobs, and publish entitlement.
- Storage, moderation, AI, Apple/Google IAP, and web payment provider choices.
- Legal copy, tax/accounting treatment, admin operations, and support playbooks.
- Custom domains, rich storefront templates, advanced branding, and direct online payment acceptance.

## Policy References
- Apple App Review Guidelines: https://developer.apple.com/app-store/review/guidelines/
- Google Play Payments policy: https://support.google.com/googleplay/android-developer/answer/9858738

## Source
- `.scratch/wayfinder-product-image-marketplace/`
