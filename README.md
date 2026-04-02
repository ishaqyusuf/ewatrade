# ewatrade

Minimal monorepo scaffold for ewatrade.

## Workspace
- `apps/storefront`: storefront application
- `apps/marketing`: platform marketing website
- `apps/pos`: point-of-sale application
- `apps/dashboard`: tenant operations dashboard
- `packages/db`: Prisma v7 database package with PostgreSQL migrations and generated client
- `packages/ui`: shared Tailwind CSS and UI-level styling primitives
- `packages/utils`: shared utility functions, including reusable tenant/domain routing helpers
- `packages/tsconfig`: shared TypeScript configs

## Commands
- `bun install`
- `bun run dev:storefront` - fixed dev port `3091`
- `bun run dev:marketing` - fixed dev port `3092`
- `bun run dev:pos` - fixed dev port `3093`
- `bun run dev:dashboard` - fixed dev port `3094`
- `bun run db:up`
- `bun run db:generate`
- `bun run db:migrate:dev`
- `bun run build`
