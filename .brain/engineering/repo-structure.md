# Repo Structure

## Purpose
Describe the current repository shape and the intended monorepo layout.

## How To Use
- Update when directories are added, renamed, or repurposed.

## Current State
- `.brain/` - Project Brain documentation currently checked into the repository.
- `apps/storefront/` - Next.js storefront application scaffold.
- `apps/marketing/` - Next.js marketing site scaffold.
- `apps/pos/` - Next.js point-of-sale application scaffold.
- `apps/dashboard/` - Next.js tenant dashboard scaffold.
- `apps/mobile/` - Expo mobile starter scaffold.
- `packages/db/` - Prisma v7 package containing the canonical PostgreSQL schema, generated client, and migration tooling.
- `packages/email/` - Shared email defaults, templates, message creation helpers, and delivery transports.
- `packages/jobs/` - Shared background job and retry scaffold with future Trigger.dev seam.
- `packages/notifications/` - Shared typed notification registry, payload-utils, services, contacts, and delivery-planning utilities.
- `packages/notifications-react/` - Shared React notification provider and viewport scaffold for client apps.
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
- `packages/email` - Email defaults, templates, and transport utilities for platform notifications.
- `packages/jobs` - Background job orchestration utilities and handlers.
- `packages/notifications` - Cross-channel notification types, payload builders, trigger services, and delivery planning.
- `packages/notifications-react` - Client-side notification delivery primitives for app toasts and ephemeral UX feedback.
- `packages/auth` - Better Auth integration and auth helpers.
- `packages/ui` - Shared UI primitives where needed.

## Notes
- Important project reference: `midday` at `/Users/M1PRO/Documents/code/_kitchen_sink/midday` is the default structural reference for future repo expansion and for any new app/package boundary decisions.
- Important project reference: `gnd` at `/Users/M1PRO/Documents/code/_turbo/gnd` is the secondary reference for app/package ergonomics and shared frontend package wiring.
- Important project reference: `school-clerk` at `/Users/M1PRO/Documents/code/school-clerk` is a reference for SaaS administration, school/tenant workflows, and operational dashboard patterns.
- Important project reference: `plotkeys` at `/Users/M1PRO/Documents/code/plot-keys` is the default reference when designing email, notifications, jobs, and related package boundaries.
- Important project reference: `halaal-coperative` at `/Users/M1PRO/Documents/code/halaal-coperative` is a reference for cooperative commerce, member/account workflows, and finance-oriented product patterns.
- Final directory names should match the actual scaffold once created.
- Keep schema ownership centralized so Prisma remains authoritative even if Drizzle is used in runtime code.

## Required Route And Component Conventions
- `components/modals/...`
- `components/sheets/global-sheets.tsx`
- `components/sheets/global-sheets-provider.tsx`
- `components/sheets/...`
- `components/tables/core`
- `components/tables/<domain>/...`
- `components/forms/...`
- `components/onboarding/...`
- `components/sidebar.tsx`
- `components/sign-out.tsx`
- `app/[...slug]/page.tsx`
- `(sidebar)/layout.tsx`
- `(sidebar)/error.tsx`
