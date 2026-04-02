# Database Relationships

## Purpose
Capture high-level relationships between major entity groups.

## How To Use
- Update when entity relationships, cardinality, or tenant boundaries change.

## Core Relationships
- Tenant -> many stores
- Tenant -> many users through memberships
- Tenant -> many orders, sites, conversations, and automation events
- Tenant -> zero or one platform subdomain and zero or one custom domain
- Store -> many products
- Product -> many variants
- Variant -> zero or one inventory item
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

## TODO
- Replace conceptual relationships with schema-backed references once Prisma models are defined.
