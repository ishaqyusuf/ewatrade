# System Overview

## Purpose
High-level summary of the platform, its business domains, and the current implementation direction.

## Product Summary
EwaTrade is a multi-tenant commerce and logistics platform for merchants, dispatch providers, drivers, and customers — with a public-facing main website that serves as a living advertisement, storefront discovery, and activity showcase for the ecosystem.

## Website Architecture

### Main Website (`ewatrade.com`)
The main site is **not** a conventional ecommerce site. It is a hybrid of three zones:
1. **Advertisement** — featured stores, logistics companies, and drivers
2. **Storefront Discovery** — products from stores with active promotions or subscriptions
3. **Operation Activity Feed** — real-time/near-real-time platform events (orders, registrations, dispatches, product views, etc.)

The main site has **no login**. It only provides:
- Public browsing of the three zones
- "Register to Get Onboard" — the single entry point for new merchants, logistics providers, and drivers

### Tenant Websites (`{slug}.ewatrade.com`)
Every tenant (merchant or logistics) can generate their own website using the Website Builder:
- **Merchant websites** — product catalog, promotions, store info, checkout
- **Logistics websites** — service zones, fleet info, delivery requests

## Authentication Model

- **Login is tenant-based** — customers and staff log in via their specific tenant site, not the main site
- **Customers use one credential** across all EwaTrade tenant sites (cross-tenant SSO via Better Auth)
- **Tenant staff** (merchants, drivers, cashiers) are scoped to their own tenant
- **Customer data** (cart, orders, saved items) is per-tenant; identity credential is global

## Primary Domains
- Main site (advertisement + discovery + activity feed)
- Merchant commerce operations (stores, products, orders, POS)
- Tenant website/storefront generation (website builder)
- Dispatch network coordination (bids, assignments, tracking)
- Marketplace discovery (public product and store index)
- POS and self-service checkout
- WhatsApp-assisted commerce flows

## Architecture Snapshot
- Planned platform shape: web + mobile clients backed by a typed API layer and shared domain services.
- Database direction: `Prisma` defines schema and migrations; `Drizzle` is used for runtime queries and repository implementation.
- Authentication direction: Better Auth (global customer identity + tenant-scoped staff sessions).
- Multi-tenant boundary: merchant and dispatch organizations are isolated by tenant identifiers.
- Activity feed: powered by Trigger.dev events; anonymized payload; no PII in feed.

## Existing Domain Docs
- `brain/modules/main-website.md` — main site zones, activity feed, registration flow
- `brain/modules/website-builder.md` — tenant website generation
- `brain/modules/*.md` — capability-level module notes
- `brain/architecture/*.md` — multi-tenant model, auth architecture
- `brain/workflows/*.md` — lifecycle flow documentation

## Current Gaps
- No checked-in application/packages structure in this workspace snapshot.
- API surface is still conceptual and needs implementation-specific docs once services are created.
- Database entity list is still a planning artifact and needs schema-backed updates later.
- Activity feed delivery mechanism (WebSocket / SSE / polling) not yet decided.
- Featured listing promotion management UI not yet designed.
