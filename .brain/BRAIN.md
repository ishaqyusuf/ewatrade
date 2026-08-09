# ewatrade Brain

## Purpose
Central index for ewatrade product, architecture, engineering, database, API, decisions, bugs, and task documentation.

## How To Use
- Start here before making product or engineering changes.
- Update linked Brain docs when architecture, schema, APIs, or priorities change.
- Preserve existing domain docs under `.brain/modules/`, `.brain/architecture/`, and `.brain/workflows/`.
- Important project reference: `midday` at `/Users/M1PRO/Documents/code/_kitchen_sink/midday` for code structure, workspace boundaries, and app/package organization unless a newer ADR overrides that direction.
- Important project reference: `gnd` at `/Users/M1PRO/Documents/code/_turbo/gnd` for shared styling, package wiring, and monorepo app/package ergonomics when relevant.
- Important project reference: `school-clerk` at `/Users/M1PRO/Documents/code/school-clerk` for SaaS administration, school/tenant workflows, and operational dashboard patterns when relevant.
- Important project reference: `plotkeys` at `/Users/M1PRO/Documents/code/plot-keys` for notifications, email, jobs, and tenant/domain utility patterns when relevant.
- Important project reference: `halaal-coperative` at `/Users/M1PRO/Documents/code/halaal-coperative` for cooperative commerce, member/account workflows, and finance-oriented product patterns when relevant.

## Current State
- The repository is an active Bun monorepo with Next.js dashboard, marketing,
  storefront, POS and API applications, an Expo mobile application, and shared
  database/domain packages.
- `ewatrade` is a multi-tenant commerce and operations platform.
- Catalog, exact inventory, tenant Customer directory, Commercial Orders,
  generic Service Operations, customer request/quote/tracking, offline replay,
  staff, billing, storefront, and messaging foundations are implemented.
- ADR-0029 defines Service Commerce as the horizontal request-to-quote/booking,
  payment, pickup/delivery, service-completion and customer-communications
  capability direction. ADR-0030 adds Progressive Catalog: verified request
  lines can grow private draft Catalog/price history before full inventory,
  without automatic publication, reusable-price mutation or invented stock.
  Pharmacy is a thin regulated extension of the shared workspace and an
  appointment business is the second validation vertical. The revised
  15-ticket source batch was owner-approved on 2026-08-09; implementation has
  resumed from Ticket 01 in dependency order.
- Mobile includes a tenant-wide global search across Orders, Customers,
  Catalog, Service Jobs, and permitted Staff, plus contextual order creation
  and auditable order/payment actor attribution.
- Product and Service are Catalog Item kinds. Variants, Offerings, Inventory
  Units, balances, commercial snapshots, and Service work are separate domain
  concepts.
- Authenticated registration and dashboards use the shared application host.
  Business subdomains are reserved for public storefront use.
- Managed `.com.ng`/`.com` source implementation routes registrar, Paystack
  and Vercel work through a server-only domain package and jobs. Database
  deployment and live provider acceptance remain blocked.
- Prescription Commerce source now implements pharmacy-owned intake,
  transcription/human review, quotation, payment, pickup/delivery, privacy,
  reporting, and tenant-owned multi-pharmacy direct Meta WhatsApp onboarding
  and routing. The Neon development schema and authenticated desktop/mobile
  setup/intake QA are complete. Production schema/backfill/contraction, live
  media/OCR/Meta/payment canaries, PCN/privacy authority, delivery SOPs, and
  design-partner acceptance remain production prerequisites.
  Its completed source/tickets remain the first-vertical evidence and are not
  replaced by the approved Service Commerce migration batch.

## Key References
- [System Overview](./SYSTEM_OVERVIEW.md)
- [Project Index](./PROJECT_INDEX.md)
- [AI Workflow](./AI_WORKFLOW.md)
- [System Overview Doc](./system/overview.md)
- [System Architecture Doc](./system/architecture.md)
- [Tech Stack](./system/tech-stack.md)
- [Repo Structure](./engineering/repo-structure.md)
- [Database Schema](./database/schema.md)
- [API Endpoints](./api/endpoints.md)
- [Managed Domains](./features/managed-domains.md)
- [Mobile Global Search And Commerce Attribution](./features/mobile-global-search-and-commerce-attribution.md)
- [Offline Order Operations](./features/offline-order-operations.md)
- [Prescription Commerce](./features/prescription-commerce.md)
- [Service Commerce](./features/service-commerce.md)
- [Progressive Catalog And Thin Pharmacy Extension](./decisions/ADR-0030-progressive-catalog-and-thin-pharmacy-extension.md)
- [Tasks Backlog](./tasks/backlog.md)
