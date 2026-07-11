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
- `bun run dev` - clear fixed ports, apply migrations, then start all dev apps
- `bun run dev:storefront` - fixed dev port `3091`
- `bun run dev:marketing` - fixed dev port `3092`
- `bun run dev:pos` - fixed dev port `3093`
- `bun run dev:dashboard` - fixed dev port `3094`
- `bun run dev:api` - fixed dev port `3095`
- `bun run dev:portless` - clear fixed ports, apply migrations, then start all Portless app scripts
- `bun run kill:ports`
- `bun run db:generate`
- `bun run db:migrate:dev`
- `bun run build`

Development starters run `dev:prepare` first. That kills stale app processes on the fixed dev ports and applies deployed Prisma migrations to the configured `DATABASE_URL` before Turbo launches app processes.

Configure `DATABASE_URL` with your Neon development branch connection string before running database or app commands:

```bash
DATABASE_URL=postgresql://USER:PASSWORD@HOST/neondb?sslmode=require
```

## Portless

App dev scripts use `portless` for stable local hostnames while preserving fixed backing ports.

```bash
bun run dev:portless
bun run dev:storefront:portless
bun run dev:marketing:portless
bun run dev:pos:portless
bun run dev:dashboard:portless
bun run dev:api:portless
```

Install the CLI once if needed:

```bash
npm install -g portless
```
