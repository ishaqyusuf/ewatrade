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
- Catalog, exact inventory, Commercial Orders, generic Service Operations,
  customer request/quote/tracking, offline replay, staff, billing, storefront,
  and messaging foundations are implemented.
- Product and Service are Catalog Item kinds. Variants, Offerings, Inventory
  Units, balances, commercial snapshots, and Service work are separate domain
  concepts.
- Authenticated registration and dashboards use the shared application host.
  Business subdomains are reserved for public storefront use.

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
- [Tasks Backlog](./tasks/backlog.md)
