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
- Service Commerce request, quote, booking, payment and fulfilment capabilities
- Pharmacy-owned Prescription Commerce as the first regulated vertical

## Architecture Snapshot
- Implemented platform shape: Next.js and Expo clients backed by Hono/tRPC and
  shared domain repositories.
- `Prisma` defines schema, migrations, generated types, and the current runtime
  repositories.
- Authentication direction: Better Auth.
- Multi-tenant boundary: merchant and dispatch organizations are isolated by tenant identifiers.
- Merchant operations use one generic Catalog/Offering model, exact stock
  ledger, a tenant Customer directory, immutable Commercial Order snapshots,
  and generic Service work.
- Owners/admins control whether a Tenant accepts offline checkout and whether
  staff records require management approval. Mobile queues only new Commercial
  Orders with their optional initial payment and customer snapshot; replay
  either stages staff work for approval or applies it directly. All other
  operational writes require a connection.
- Public Service Request, Quote acceptance, and tracking live on storefront
  routes; authenticated dashboards never live on a business subdomain.
- Service Commerce is the approved horizontal architecture direction over the
  existing Catalog, Customer, Commerce, Service Operations, Fulfilment,
  Communications and Reporting boundaries. Existing `ServiceRequest` and
  `PrescriptionRequest` aggregates stay authoritative; no universal request
  table or platform migration is approved yet.
- Managed domain source supports GO54 `.com.ng`, Openprovider `.com`, Paystack
  checkout and Vercel connection behind server-only adapters and jobs.
- Prescription Commerce defines pharmacy-owned WABAs/numbers, one shared
  EwaTrade Meta application/webhook, recipient-number-first Tenant routing,
  Store channel bindings, and direct Meta Cloud API behind provider-neutral
  Communications. The source implementation includes manual and Embedded
  Signup, pending-to-active readiness, scoped Redis state, and redacted routing
  alerts.
- Local application, Prisma, fixture, and browser-QA work uses the Neon
  development database selected by `.env.local`; EwaTrade does not use a local
  Docker/PostgreSQL fallback.

## Existing Domain Docs
- `.brain/modules/*.md` contains capability-level module notes.
- `.brain/architecture/*.md` contains early architecture notes.
- `.brain/workflows/*.md` contains lifecycle flow documentation.

## Current Gaps
- Managed object storage and a trusted media safety pipeline are not selected;
  optional device-retained Service Evidence therefore remains private and
  cannot be published.
- Prescription Commerce now has authenticated desktop/mobile and Neon
  development validation. Broader cross-product and full cross-channel
  behavioral validation remains separate follow-up work.
- Managed domain database deployment and live registrar/payment/hosting
  acceptance are blocked pending the production rollout, credentials, and
  canaries; the current Prisma schema is present in Neon development.
- Prescription Commerce extends shared Quote, Order, payment, messaging,
  inventory, and delivery primitives with private media, mandatory OCR line
  verification, pharmacist release, multi-Tenant inbound WhatsApp routing,
  privacy/retention controls, and commercial reporting. Production schema and
  live-provider acceptance remain gated.
- The proposed Service Commerce migration must preserve Generic Service and
  Prescription compatibility, add booking as an explicit capability, and prove
  an appointment-based second vertical before any contraction.
