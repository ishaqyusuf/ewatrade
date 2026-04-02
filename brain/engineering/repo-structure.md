# Repo Structure

## Purpose
Describe the current repository shape and the intended monorepo layout.

## How To Use
- Update when directories are added, renamed, or repurposed.

## Current State
- `brain/` - Project Brain documentation currently checked into the repository.
- `apps/storefront/` - Next.js storefront application scaffold.
- `apps/marketing/` - Next.js marketing site scaffold.
- `apps/pos/` - Next.js point-of-sale application scaffold.
- `apps/dashboard/` - Next.js tenant dashboard scaffold.
- `packages/db/` - Prisma v7 package containing the canonical PostgreSQL schema, generated client, and migration tooling.
- `packages/email/` - Shared email payload creation and delivery adapter scaffold.
- `packages/jobs/` - Shared background job and retry scaffold with future Trigger.dev seam.
- `packages/notifications/` - Shared notification composition and delivery-planning scaffold.
- `packages/ui/` - Shared Tailwind CSS and UI styling package.
- `packages/utils/` - Shared utility package.
- `packages/tsconfig/` - Shared TypeScript config package.

## Intended Structure
- `apps/storefront` - Next.js storefront surfaces.
- `apps/marketing` - Platform marketing and acquisition surfaces.
- `apps/pos` - POS and assisted self-checkout surfaces.
- `apps/dashboard` - Merchant/admin operations surfaces.
- `apps/mobile` - Expo mobile app for merchant and/or courier flows.
- `apps/api` - Hono/tRPC backend entry points if separated as an app.
- `packages/db` - Prisma schema, generated client/types, migration ownership, and future Drizzle repository utilities.
- `packages/email` - Email composition and transport utilities for platform notifications.
- `packages/jobs` - Background job orchestration utilities and handlers.
- `packages/notifications` - Cross-channel notification builders and delivery planning.
- `packages/auth` - Better Auth integration and auth helpers.
- `packages/ui` - Shared UI primitives where needed.
- `packages/domain` - Shared domain models, service helpers, and validation.

## Notes
- Use `~/Document/code/_kitchen_sink/midday` as the default structural reference for future repo expansion and for any new app/package boundary decisions.
- Use `~/Documents/code/_turbo/gnd` as a secondary reference for app/package ergonomics and shared frontend package wiring.
- Use `~/Documents/code/plot-keys` as the default reference when designing email, notifications, jobs, and related package boundaries.
- Final directory names should match the actual scaffold once created.
- Keep schema ownership centralized so Prisma remains authoritative even if Drizzle is used in runtime code.
