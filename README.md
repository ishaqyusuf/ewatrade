# ewatrade

Minimal monorepo scaffold for ewatrade.

## Workspace
- `apps/web`: Next.js App Router frontend
- `packages/db`: Prisma v7 database package with PostgreSQL migrations and generated client
- `packages/ui`: shared Tailwind CSS and UI-level styling primitives
- `packages/utils`: shared utility functions
- `packages/tsconfig`: shared TypeScript configs

## Commands
- `bun install`
- `bun run dev:web`
- `bun run db:up`
- `bun run db:generate`
- `bun run db:migrate:dev`
- `bun run build`
