# ADR-0005: Separate Image Tokens From Storefront Publishing Entitlement

## Status
Accepted

## Context
The product image marketplace Wayfinder resolved token-gated image reuse, optional AI refinement, and paid storefront publishing. These are related merchant growth workflows, but they have different billing and entitlement rules.

## Decision
- Model image marketplace usage and AI refinement as token-ledger workflows owned by the tenant billing account with store attribution.
- Model Publish Site as a store-level entitlement under tenant billing/subscription ownership, not as a token spend.
- Treat native mobile token top-ups as digital in-app purchases that should use Apple/Google billing paths unless an approved alternative-billing program applies.
- Permit web/dashboard token top-ups through normal provider checkout.
- Keep product image licenses as copied in-platform asset rights, not ownership transfer.

## Consequences
- Token ledger accounting can handle holds, debits, earned credits, refunds, disputes, and payout reversals without overloading subscription state.
- Storefront publishing can fit the existing store/site/hostname primitives and subscription packaging.
- Native mobile payment implementation must account for App Store and Google Play digital-goods policy before exposing token purchase UI.
