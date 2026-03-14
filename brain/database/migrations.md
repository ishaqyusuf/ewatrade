# Database Migrations

## Purpose
Document migration ownership and safety rules.

## How To Use
- Update when migration tooling or rollout process changes.

## Strategy
- Migrations are owned by Prisma.
- Schema changes should flow from Prisma schema updates into generated migrations.
- Drizzle runtime queries must stay compatible with the Prisma-managed schema.

## Safety Rules
- Review tenant isolation impact before applying schema changes.
- Avoid destructive migrations without data backfill/transition planning.
- Record major schema shifts in an ADR.

## TODO
- Add command references once the database package is scaffolded.
- Add environment rollout notes once staging/production infrastructure exists.
