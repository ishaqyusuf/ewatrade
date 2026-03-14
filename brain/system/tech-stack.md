# Tech Stack

## Purpose
Canonical stack reference for current implementation choices.

## How To Use
- Update when adopting, replacing, or removing core technologies.

## Application Stack
- Web: Next.js
- Mobile: Expo / React Native
- API server: Hono
- Typed API contracts: tRPC
- Background jobs: Trigger.dev
- Auth: Better Auth

## Database Stack
- Schema modeling: Prisma
- Migrations: Prisma
- Runtime querying / repositories: Drizzle
- Database provider: TODO: choose target database engine and hosting

## Guidance
- Model entities in Prisma first.
- Keep migrations driven from the Prisma schema.
- Use Drizzle in repository code when expressive SQL composition or lean runtime access is needed.
- Avoid duplicating schema ownership across both Prisma and Drizzle definitions.

## Excluded Stack
- Supabase is not part of the current platform design.
