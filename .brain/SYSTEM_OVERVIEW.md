# System Overview

## Purpose
High-level summary of the platform, its business domains, and the current implementation direction.

## Product Summary
`ewatrade` is a multi-tenant commerce and logistics platform for merchants, dispatch providers, and customers.

## Primary Domains
- Merchant commerce operations
- Website/storefront generation
- Marketplace discovery
- Dispatch network coordination
- POS and self-service checkout
- WhatsApp-assisted commerce flows

## Architecture Snapshot
- Implemented platform shape: Next.js and Expo clients backed by Hono/tRPC and
  shared domain repositories.
- `Prisma` defines schema, migrations, generated types, and the current runtime
  repositories.
- Authentication direction: Better Auth.
- Multi-tenant boundary: merchant and dispatch organizations are isolated by tenant identifiers.
- Merchant operations use one generic Catalog/Offering model, exact stock
  ledger, immutable Commercial Order snapshots, and generic Service work.
- Public Service Request, Quote acceptance, and tracking live on storefront
  routes; authenticated dashboards never live on a business subdomain.

## Existing Domain Docs
- `.brain/modules/*.md` contains capability-level module notes.
- `.brain/architecture/*.md` contains early architecture notes.
- `.brain/workflows/*.md` contains lifecycle flow documentation.

## Current Gaps
- Managed object storage and a trusted media safety pipeline are not selected;
  optional device-retained Service Evidence therefore remains private and
  cannot be published.
- Behavioral web/mobile/database validation is intentionally deferred to a
  separate owner-requested testing goal.
