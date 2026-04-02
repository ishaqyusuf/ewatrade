# Database Schema

## Purpose
Track the conceptual schema and schema ownership rules for the platform.

## How To Use
- Update when entities, ownership rules, or schema tooling changes.

## Schema Ownership
- `Prisma` is the source of truth for schema definitions.
- Prisma schema changes should generate and track migrations.
- `Drizzle` should not become a competing schema definition layer.
- The canonical Prisma provider is `postgresql`.
- Prisma schema is organized as a file-based schema under `packages/db/prisma/` with domain-specific `.prisma` files.

## Core Entity Groups
- Tenant: merchant tenant, dispatch tenant, and tenant-owned hostname records for each application surface
- Identity: user, session, account, membership
- Commerce: store, product, product variant, inventory item, cart, order, order item
- Fulfillment: delivery request, dispatch provider, bid, assignment, tracking event
- Storefront: site, page, section, theme, template
- POS: cashier session, receipt, barcode event
- Messaging: conversation, message, automation event

## Implemented Schema Modules
- `packages/db/prisma/models/base.prisma` - tenants, users, sessions, accounts, memberships
- `packages/db/prisma/models/base.prisma` also owns `TenantHostname` records for tenant, POS, and dashboard hostname mapping
- `packages/db/prisma/models/commerce.prisma` - stores, products, variants, inventory, carts, orders
- `packages/db/prisma/models/fulfillment.prisma` - delivery requests, bids, assignments, tracking
- `packages/db/prisma/models/storefront.prisma` - sites, pages, sections, themes, templates
- `packages/db/prisma/models/pos.prisma` - cashier sessions, receipts, barcode events
- `packages/db/prisma/models/messaging.prisma` - conversations, messages, automation events
- `packages/db/prisma/models/enums.prisma` - shared enum definitions

## Cross-Cutting Rules
- Tenant-owned records require `tenantId`.
- Tenant hostname resolution is modeled through `TenantHostname` records instead of a single pair of domain fields on `Tenant`.
- Public marketplace data must be explicitly flagged for exposure.
- Audit fields should exist on operational entities.

## TODO
- Confirm whether merchant and dispatch organizations share one tenant table or use role-specific tables.
- Refine auth tables once Better Auth integration is selected at implementation time.
- Add migrations once a local PostgreSQL instance is available and the first migration is generated.
