# Product Vision

## Purpose
Capture the product direction and who the platform is for.

## Vision
Build commerce and logistics infrastructure for African merchants that combines storefronts, merchant operations, fulfillment coordination, and communication workflows in one multi-tenant platform — anchored by a main website that shows the ecosystem alive and growing, while enabling customers to shop across all stores in one place.

## Primary Users
- Merchants (store owners)
- Logistics / dispatch providers
- Drivers
- Store cashiers and staff
- End customers (walk-in and online)

## Differentiation
- Commerce plus logistics in one platform
- Every tenant (store or logistics) gets their own generated website, templated by business kind
- Main platform website is a hybrid: marketplace discovery + live activity feed + customer sign-in/sign-up + multi-store checkout — not a conventional single-vendor ecommerce site
- Strong multi-store and multi-tenant model
- Shared customer identity across all tenant sites (one login for all EwaTrade stores and the main site)
- Website builder with templates driven by store category / business kind
- WhatsApp AI commerce at two levels: platform-wide bot + per-store bot
- Offline-capable POS (Tauri desktop app) with dual-screen support and zero-downtime sync
- **EwaTrade holds no money** — all payments go directly to merchant bank accounts via payment gateway subaccounts

## Payment Principle
EwaTrade is a technology infrastructure provider, not a payment aggregator or wallet. All customer payments flow directly to the merchant (Paystack/Flutterwave subaccounts). EwaTrade may deduct a platform fee via split payment, but never holds funds. See `brain/modules/payment-integration.md`.

## Legal Principle
All registering businesses must provide CAC (Corporate Affairs Commission) documentation. EwaTrade's ToC clearly states it is not responsible for merchant fraud, product failures, or delivery damages, but will provide full tenant information to authorities upon lawful request. See `brain/legal/legal-framework.md`.

## Main Site as a Living Commerce Hub
The main EwaTrade website serves multiple purposes simultaneously:
- **Showcase**: real-time platform activity (orders, dispatches, registrations)
- **Discovery**: featured merchants, products, logistics providers
- **Customer home**: sign in / sign up + multi-store shopping cart + "My Orders" view
- **Onboarding entry point**: merchants, logistics providers, and riders register from here

## Design System
See `brain/design/design-system.md` — currently a direction document; implementation not started.
