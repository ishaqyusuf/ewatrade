# Database Migrations

## Purpose
Document migration ownership and safety rules.

## How To Use
- Update when migration tooling or rollout process changes.

## Strategy
- Migrations are owned by Prisma.
- Schema changes should flow from Prisma schema updates into generated migrations.
- Drizzle runtime queries must stay compatible with the Prisma-managed schema.
- PostgreSQL is the canonical migration target for all environments.
- Local development uses Docker Compose to run PostgreSQL before applying Prisma migrations.

## Safety Rules
- Review tenant isolation impact before applying schema changes.
- Avoid destructive migrations without data backfill/transition planning.
- Record major schema shifts in an ADR.

## TODO
- Add environment rollout notes once staging/production infrastructure exists.

## Current Commands
- `bun run db:up` - start the local PostgreSQL container
- `bun run db:down` - stop the local PostgreSQL container
- `bun run db:generate` - generate Prisma Client from the file-based schema
- `bunx prisma migrate diff --from-empty --to-schema prisma --script --output prisma/migrations/0001_init/migration.sql` - refresh the baseline SQL migration without a running database
- `bun run db:migrate:dev` - create and apply a development migration
- `bun run db:migrate:deploy` - apply committed migrations in deployed environments
- `bun run db:studio` - open Prisma Studio against the configured database
