# System Architecture

## Purpose
Describe the intended technical architecture and responsibility boundaries for the platform.

## How To Use
- Update when the stack, layering, or service boundaries change.
- Keep this doc implementation-aware but concise.

## Architecture Direction
- Workspace shape: follow the `midday` project monorepo pattern with `apps/*` and `packages/*` as the primary structure, with any future tooling packages added only when needed.
- Frontends: Next.js web applications and planned Expo mobile applications.
- Backend entry points: Hono-based HTTP services with typed tRPC procedures where shared end-to-end contracts are needed.
- Domain flow: client -> API layer -> service layer -> repository layer -> database.
- Async work: Trigger.dev for jobs and workflow orchestration.
- Auth: Better Auth for identity, sessions, and tenant-aware access control.

## Data Access Strategy
- `Prisma` is the source of truth for schema modeling, generated types, and migrations.
- `Drizzle` is the preferred query builder/runtime for repository implementations and SQL-heavy access patterns.
- Repositories should hide ORM/query-tool specifics from service and API layers.

## Offline Sync Boundary
- Mobile can queue Retail Ops events locally after a user has logged in once.
- API sync procedures must remain idempotent by tenant-scoped client event ids.
- Durable offline device, revocation, sync run, and sync event tables now exist in Prisma source schema, migrations, and the generated Prisma client.
- Live sync history writes/reads and offline-device registration, listing, revocation, restoration, sync eligibility checks, and subscription usage counts are durable-first with tenant-metadata fallback until every environment has applied the migration.
- First sync conflict review reads/acknowledgements sit behind service/repository boundaries. Guided resolution actions, retry scheduling, and broader admin resolution workflows should stay out of UI components and behind those same boundaries.

## Multi-Tenancy
- Every tenant-owned entity carries a tenant identifier.
- Merchant tenants and dispatch tenants are isolated in storage and authorization.
- Public marketplace reads must only expose explicitly public data.

## Explicit Non-Goals
- No Supabase dependency in the current architecture.
- No direct client access to the database.

## Open Items
- TODO: Expand the current `midday`-style monorepo scaffold with `apps/mobile`, `apps/api`, and domain packages as implementation begins.
- TODO: Document cache, queue, and object storage decisions when selected.
