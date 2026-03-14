# Database Relationships

## Purpose
Capture high-level relationships between major entity groups.

## How To Use
- Update when entity relationships, cardinality, or tenant boundaries change.

## Core Relationships
- Tenant -> many stores
- Tenant -> many users through memberships
- Store -> many products
- Product -> many variants
- Order -> many order items
- Order -> zero or one delivery request
- Delivery request -> many bids
- Dispatch provider -> many bids and assignments
- Site -> many pages
- Page -> many sections

## Tenant Rules
- Merchant data and dispatch data must be scoped through tenant-aware joins and filters.
- Shared/public read models should be derived from explicitly public entities only.

## TODO
- Replace conceptual relationships with schema-backed references once Prisma models are defined.
