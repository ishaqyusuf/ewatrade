# Repo Structure

## Purpose
Describe the current repository shape and the intended monorepo layout.

## How To Use
- Update when directories are added, renamed, or repurposed.

## Current State
- `brain/` - Project Brain documentation currently checked into the repository.
- No application or package directories detected in this workspace snapshot.

## Intended Structure
- `apps/web` - Next.js merchant/admin/public web surfaces.
- `apps/mobile` - Expo mobile app for merchant and/or courier flows.
- `apps/api` - Hono/tRPC backend entry points if separated as an app.
- `packages/db` - Prisma schema, generated client/types, migration ownership, and Drizzle repository utilities.
- `packages/auth` - Better Auth integration and auth helpers.
- `packages/ui` - Shared UI primitives where needed.
- `packages/domain` - Shared domain models, service helpers, and validation.

## Notes
- Final directory names should match the actual scaffold once created.
- Keep schema ownership centralized so Prisma remains authoritative even if Drizzle is used in runtime code.
