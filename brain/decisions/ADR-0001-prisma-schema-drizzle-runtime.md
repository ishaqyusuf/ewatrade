# ADR-0001: Prisma Owns Schema, Drizzle Handles Runtime Queries

## Status
Accepted

## Context
The project needs a clear database ownership model while still allowing ergonomic runtime querying in repository code. Keeping two separate schema authorities would increase drift risk and make migrations harder to reason about.

## Decision
- Use `Prisma` as the source of truth for schema definitions, generated types, and migrations.
- Use `Drizzle` for runtime query construction and repository implementations where direct SQL composition is helpful.
- Do not adopt Supabase as part of the current platform architecture.

## Consequences
- Schema changes must start in Prisma, not in Drizzle table definitions.
- Repository code can still use Drizzle ergonomics without fragmenting schema ownership.
- Future contributors should update Brain docs and implementation scaffolding to preserve this boundary.
