# System Overview

## Purpose
High-level summary of the platform, its business domains, and the current implementation direction.

## Product Summary
O-Commerce is a multi-tenant commerce and logistics platform for merchants, dispatch providers, and customers.

## Primary Domains
- Merchant commerce operations
- Website/storefront generation
- Marketplace discovery
- Dispatch network coordination
- POS and self-service checkout
- WhatsApp-assisted commerce flows

## Architecture Snapshot
- Planned platform shape: web + mobile clients backed by a typed API layer and shared domain services.
- Database direction: `Prisma` defines schema and migrations; `Drizzle` is used for runtime queries and repository implementation.
- Authentication direction: Better Auth.
- Multi-tenant boundary: merchant and dispatch organizations are isolated by tenant identifiers.

## Existing Domain Docs
- `brain/modules/*.md` contains capability-level module notes.
- `brain/architecture/*.md` contains early architecture notes.
- `brain/workflows/*.md` contains lifecycle flow documentation.

## Current Gaps
- No checked-in application/packages structure in this workspace snapshot.
- API surface is still conceptual and needs implementation-specific docs once services are created.
- Database entity list is still a planning artifact and needs schema-backed updates later.
