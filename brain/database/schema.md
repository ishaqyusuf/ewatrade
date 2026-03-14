# Database Schema

## Purpose
Track the conceptual schema and schema ownership rules for the platform.

## How To Use
- Update when entities, ownership rules, or schema tooling changes.

## Schema Ownership
- `Prisma` is the source of truth for schema definitions.
- Prisma schema changes should generate and track migrations.
- `Drizzle` should not become a competing schema definition layer.

## Core Entity Groups
- Tenant: merchant tenant, dispatch tenant
- Identity: user, session, account, membership
- Commerce: store, product, product variant, inventory item, cart, order, order item
- Fulfillment: delivery request, dispatch provider, bid, assignment, tracking event
- Storefront: site, page, section, theme, template
- POS: cashier session, receipt, barcode event
- Messaging: conversation, message, automation event

## Cross-Cutting Rules
- Tenant-owned records require `tenantId`.
- Public marketplace data must be explicitly flagged for exposure.
- Audit fields should exist on operational entities.

## TODO
- Define exact table names and field sets once the Prisma schema is created.
- Confirm whether merchant and dispatch organizations share one tenant table or use role-specific tables.
