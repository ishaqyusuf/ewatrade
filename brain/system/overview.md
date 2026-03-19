# System Overview

## Purpose
Operational summary of the platform and how its major domains fit together.

## Platform Shape
Multi-tenant commerce and logistics platform for African businesses. Customers shop across stores from the main site or individual tenant storefronts. Merchants manage stores, orders, and POS. Logistics providers manage dispatch. EwaTrade holds no funds — payments are direct to businesses.

## Major Domains

### Commerce
- **Merchant system** — store onboarding, store setup, multi-store support
- **Business types** — taxonomy of store kinds driving template selection and features
- **Order management** — manual + automatic orders, multi-channel, fulfillment lifecycle
- **Payment integration** — direct-to-business via Paystack/Flutterwave subaccounts

### Discovery & Storefronts
- **Website builder** — template-based tenant sites; templates filtered by business kind
- **Marketplace** — product discovery, merchant promotion, main site listing
- **Main site** — sign in/sign up, multi-store cart, order tracking, activity feed

### Customer
- **Customer identity** — central `User` + per-tenant `TenantCustomer`, shared SSO
- **Multi-store checkout** — cart split by store, independent payments per merchant

### Logistics
- **Dispatch network** — open bidding, provider onboarding, rider management, zones
- **Order delivery flow** — order → payment → fulfillment → dispatch → tracking → completion

### Physical Retail
- **POS software** — Tauri desktop app, dual-screen, offline-first, store import
- **POS cashier** — cashier sessions, walk-in customer flows, receipts
- **Self-service checkout** — customer app scan + QR cashier verification + tip

### Communication
- **WhatsApp commerce** — platform-level AI bot + per-store AI bot, order creation via chat

### Legal & Compliance
- **Legal framework** — CAC requirement, Terms of Service, liability, dispute process

### Design
- **Design system** — shared component library, token system (direction document)

## Source Docs
- `brain/modules/*.md`
- `brain/workflows/order-delivery-flow.md`
- `brain/architecture/multi-tenant.md`
- `brain/legal/legal-framework.md`
- `brain/design/design-system.md`
