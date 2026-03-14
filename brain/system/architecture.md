# System Architecture

## Purpose
Describe the intended technical architecture and responsibility boundaries for the platform.

## How To Use
- Update when the stack, layering, or service boundaries change.
- Keep this doc implementation-aware but concise.

## Architecture Direction
- Frontends: planned Next.js web applications and Expo mobile applications.
- Backend entry points: Hono-based HTTP services with typed tRPC procedures where shared end-to-end contracts are needed.
- Domain flow: client -> API layer -> service layer -> repository layer -> database.
- Async work: Trigger.dev for jobs and workflow orchestration.
- Auth: Better Auth for identity, sessions, and tenant-aware access control.

## Data Access Strategy
- `Prisma` is the source of truth for schema modeling, generated types, and migrations.
- `Drizzle` is the preferred query builder/runtime for repository implementations and SQL-heavy access patterns.
- Repositories should hide ORM/query-tool specifics from service and API layers.

## Multi-Tenancy
- Every tenant-owned entity carries a tenant identifier.
- Merchant tenants and dispatch tenants are isolated in storage and authorization.
- Public marketplace reads must only expose explicitly public data.

## Explicit Non-Goals
- No Supabase dependency in the current architecture.
- No direct client access to the database.

## Open Items
- TODO: Define actual monorepo package boundaries once code scaffolding exists.
- TODO: Document cache, queue, and object storage decisions when selected.
