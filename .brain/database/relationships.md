# Database Relationships

## Purpose
Capture high-level relationships between major entity groups.

## How To Use
- Update when entity relationships, cardinality, or tenant boundaries change.

## Core Relationships
- Tenant -> many stores
- Tenant -> many users through memberships
- Tenant -> many orders, sites, conversations, and automation events
- Tenant -> many storefront and POS hostname records; the dashboard is a shared platform host and has no hostname row for new tenants
- Store -> many catalog items through compatibility `Product` rows
- Catalog item (`Product`) -> many variants
- Catalog item (`Product`) -> zero or one Service item profile
- Product-kind variant -> zero or one inventory item
- Order -> many kind-snapshotted order items
- Order -> zero or one Service Job grouping its Service lines
- Service Job -> many Service Job lines, events, evidence records, and assignments
- Service request link -> many Service requests
- Service request -> many priced Service request lines
- Service request -> zero or one converted Order and Service Job
- Catalog item and Service records -> at most one canonical migrated record per scoped legacy source id
- Cart -> many cart items
- Order -> many order items
- Order -> zero or one delivery request
- Delivery request -> many bids
- Delivery request -> zero or one assignment
- Dispatch provider -> many bids and assignments
- Site -> many pages
- Page -> many sections

## Tenant Rules
- Merchant data and dispatch data must be scoped through tenant-aware joins and filters.
- Shared/public read models should be derived from explicitly public entities only.
- Catalog, order, and Service Job repositories resolve tenant and store scope before kind checks or writes.
- Public service request/tracking reads resolve opaque tokens and omit raw ids, private evidence, internal notes, actor ids, and private contacts.

## TODO
- Replace conceptual relationships with schema-backed references once Prisma models are defined.
