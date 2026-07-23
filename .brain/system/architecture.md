# System Architecture

## Purpose
Describe the intended technical architecture and responsibility boundaries for the platform.

## How To Use
- Update when the stack, layering, or service boundaries change.
- Keep this doc implementation-aware but concise.

## Architecture Direction
- Workspace shape: follow the `midday` project monorepo pattern with `apps/*` and `packages/*` as the primary structure, with any future tooling packages added only when needed.
- Frontends: Next.js web applications and an Expo mobile application.
- Dashboard feature routes follow the Midday workspace pattern: authenticate
  and resolve tenant/store on the server, prefetch typed bounded queries,
  hydrate focused client workspaces, keep navigable search/filter/sheet state
  in URL hooks, and colocate domain tables, sheet shells, forms, loading/empty
  states and route recovery by responsibility.
- Desktop wrapper: a private Tauri package may wrap the dashboard URL for internal desktop builds, but dashboard workflows remain implemented in the web dashboard.
- Backend entry points: Hono-based HTTP services with typed tRPC procedures where shared end-to-end contracts are needed.
- Domain flow: client -> API layer -> service layer -> repository layer -> database.
- Async work: Trigger.dev for jobs and workflow orchestration.
- Auth: Better Auth for identity, sessions, and tenant-aware access control.

## Data Access Strategy
- `Prisma` is the source of truth for schema modeling, generated types, and migrations.
- Current repositories use the generated Prisma client behind explicit query
  modules. UI and API layers do not access the database directly.

## Operational Boundaries
- Catalog separates item kind, customer options, commercial Offerings, Product
  unit configuration, Store availability and price history.
- Inventory uses exact decimal strings, immutable configuration versions,
  explicit Balance Sources, reservations and atomic Stock Operations.
- Commerce owns Commercial Orders and immutable Offering Snapshots. Product
  fulfillment and Service work are downstream effects, not Order-line types.
- Service Operations owns Intake, Job/Line allocation, work state, assignments,
  promises, notes, exceptions, evidence and rework. Customer Access owns public
  Requests, Quote acceptance and safe tracking projections.

## Offline Sync Boundary
- Mobile queues only the explicit supported operational command union after a
  user has authenticated once.
- Commands use tenant-scoped client ids, payload hashes, schema/event versions,
  dependencies and typed conflict results.
- Durable `OfflineDevice`, `OfflineCommand`, `OfflineConflictReview` and
  `OfflineDeviceRevocation` records are authoritative. The removed generic
  sync-run/event and metadata fallbacks are not read.
- Public requests, Quotes, evidence publication, payment and provider delivery
  remain online-only.

## Mobile Interaction Boundary

- The mobile application uses one floating bottom-tab shell with a central
  create action and full-screen modal routes for workflows exceeding roughly
  half a phone screen.
- Optional advanced Catalog and Service inputs are progressively revealed.
  Keyboard-sticky inline composition is reused for compact repeated-value
  entry; ordinary forms remain keyboard-safe.

## Observability Boundary

- Each independently deployed application owns a separate Sentry project.
- `apps/mobile` reports to `cipron-concepts/ewatrade-mobile` and identifies
  development, preview, and production through the Sentry environment field.
- The public DSN may be provided through `EXPO_PUBLIC_SENTRY_DSN`. The private
  `SENTRY_AUTH_TOKEN` is build-time only, must remain outside version control,
  and is used solely for source-map and debug-symbol uploads.
- Mobile default PII collection, Session Replay, user feedback, and SDK logs
  remain disabled until an explicit privacy and retention decision enables
  them.

## Multi-Tenancy
- Every tenant-owned entity carries a tenant identifier.
- Merchant tenants and dispatch tenants are isolated in storage and authorization.
- Public marketplace reads must only expose explicitly public data.

## Explicit Non-Goals
- No Supabase dependency in the current architecture.
- No direct client access to the database.

## Open Items
- If cross-device or public Service Evidence is enabled, configure managed
  object storage and trusted media verification. Device-retained private
  evidence remains usable without that deployment integration.
- Run behavioral cross-surface validation in the separate owner-requested
  testing goal.
