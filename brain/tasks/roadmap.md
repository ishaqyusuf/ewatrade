# Roadmap

## Purpose
Longer-horizon sequencing across major implementation phases.

## Phases

### Phase 1 — Foundation
- Monorepo scaffolding (web, mobile, API, shared packages, Tauri POS)
- Auth (Better Auth) — customer SSO, tenant-scoped staff auth, main site sign in/up
- Multi-tenancy — tenant provisioning, isolation, membership/roles
- Database schema — all core entities (Prisma schema + migrations)
- Business type taxonomy — `BusinessCategory` + `StoreKind` lookup data

### Phase 2 — Commerce Core
- Merchant onboarding (all 6 steps including `storeKind` selection, CAC upload)
- Store creation and product catalog
- Inventory management
- Customer identity + `TenantCustomer` auto-creation
- Order management — lifecycle, manual order creation, order splitting
- Payment integration — Paystack subaccount setup, online checkout, webhook handling
- Legal acceptance — ToC + Privacy Policy acceptance during onboarding

### Phase 3 — Logistics
- Logistics company + driver onboarding (CAC + full verification docs)
- Dispatch network — open bidding, assignment, tracking
- Service zones
- Reputation scoring
- Dispatch management dashboard (driver roster, live map, delivery queue)

### Phase 4 — Channels
- Website builder — template system, section types, theme tokens
- Templates per `storeKind` and logistics/rider type
- Marketplace listing and discovery
- Main site — multi-store cart, split checkout, customer My Orders
- Main site activity feed

### Phase 5 — Retail Ops & Communication
- POS software (Tauri) — dual-screen, offline mode, cashier sessions
- Walk-in self-service QR checkout flow
- Store product import (Excel/CSV)
- WhatsApp commerce — platform bot + per-store bot (AI order creation)
- Packing + dispatch notification flows

### Phase 6 — Intelligence & Scale
- AI product extraction agent (import from existing software)
- Analytics and reporting (merchant dashboard, logistics dashboard)
- Automation (restock alerts, loyalty, re-engagement)
- Advanced WhatsApp flows (returns, reviews, support escalation)
- Custom domain support for tenant sites
- B2B / wholesale order flows
