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
- Notifications: shared package-driven notification composition with email-first delivery scaffolding
- Email: shared package-driven email payload and transport scaffolding
- Auth: Better Auth

## Database Stack
- Schema modeling: Prisma
- Migrations: Prisma
- Runtime querying / repositories: Drizzle
- Database provider: PostgreSQL as the canonical application database
- Local database runtime: Docker Compose with a PostgreSQL container

## Guidance
- Model entities in Prisma first.
- Keep migrations driven from the Prisma schema.
- Use Drizzle in repository code when expressive SQL composition or lean runtime access is needed.
- Avoid duplicating schema ownership across both Prisma and Drizzle definitions.

## Excluded Stack
- Supabase is not part of the current platform design.
