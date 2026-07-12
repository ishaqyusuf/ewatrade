# Tech Stack

## Purpose
Canonical stack reference for current implementation choices.

## How To Use
- Update when adopting, replacing, or removing core technologies.

## Application Stack
- Monorepo/tooling: Bun workspaces + Turborepo + shared TypeScript configs
- Web apps: Next.js 16 App Router across storefront, marketing, POS, and dashboard surfaces
- Web styling: Tailwind CSS 4 via shared `packages/ui` CSS and shared PostCSS config patterned after the `gnd` project
- Mobile: Expo / React Native
- API server: Hono
- Typed API contracts: tRPC
- Background jobs: Trigger.dev
- Notifications: shared package-driven typed notification registry with payload-utils, trigger services, and delivery planning
- Client notifications: shared React notification provider and viewport package for app toasts
- Email: shared package-driven email defaults, templates, message helpers, and transports
- Auth: Better Auth

## Database Stack
- Schema modeling: Prisma
- Migrations: Prisma
- Runtime querying / repositories: Drizzle
- Database provider: PostgreSQL as the canonical application database
- Development database runtime: local Docker PostgreSQL by default, with `remote-dev` and `prod` database profiles available through `DEV_PROFILE`/`APP_ENV` and `LOCAL_DATABASE_URL`/`REMOTE_DEV_DATABASE_URL`/`PROD_DATABASE_URL`.

## Guidance
- Model entities in Prisma first.
- Keep migrations driven from the Prisma schema.
- Use Drizzle in repository code when expressive SQL composition or lean runtime access is needed.
- Avoid duplicating schema ownership across both Prisma and Drizzle definitions.

## Excluded Stack
- Supabase is not part of the current platform design.
- Local named-host dev: Portless-capable workspace scripts. Website/dashboard QA should use `bun run dev --local --filter dashboard marketing` when those apps are in scope, then browse the repository's Portless hostnames for marketing, storefront, dashboard, POS, and API flows instead of raw localhost ports.
