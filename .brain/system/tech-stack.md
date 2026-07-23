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
- Jobs dev runtime: `@ewatrade/jobs` exposes `bun --filter @ewatrade/jobs dev`, which runs `trigger dev` through the shared env loader and Trigger profile helper.
- Jobs deployment runtime: root `bun run jobs:deploy` forwards to `@ewatrade/jobs deploy`, loading `.env.production`, requiring a non-local production database URL, and passing the configured Trigger profile to `trigger deploy`.
- Notifications: shared package-driven typed notification registry with payload-utils, trigger services, and delivery planning
- Client notifications: shared React notification provider and viewport package for app toasts
- Email: shared package-driven email defaults, templates, message helpers, and transports. Resend is the production provider when `RESEND_API_KEY` is present; console delivery remains the no-provider fallback. Root `bun run email:test` sends a smoke email to the first configured `TEST_EMAILS` recipient, falling back to `TEST_EMAIL`.
- Auth: Better Auth
- Mobile observability: Sentry React Native SDK in `apps/mobile`, using the
  `cipron-concepts/ewatrade-mobile` project for JavaScript errors, native
  crashes, release artifacts, source maps, and debug symbols. Session Replay,
  user feedback, logs, and default PII collection are disabled.

## Database Stack
- Schema modeling: Prisma
- Migrations: Prisma
- Runtime querying / repositories: Drizzle
- Database provider: PostgreSQL as the canonical application database
- Development database runtime: local Docker PostgreSQL by default, with `remote-dev` and `prod` database profiles available through `DEV_PROFILE`/`APP_ENV` and `LOCAL_DATABASE_URL`/`REMOTE_DEV_DATABASE_URL`/`PROD_DATABASE_URL`.
- Development command router: `bun run dev` selects the environment profile
  with `--local`, `--remote`/`--remote-dev`, or `--prod`, then forwards package
  filters to Turbo. When dev is required and not already running, launch the
  required profile in a dedicated managed terminal session.

## Guidance
- Model entities in Prisma first.
- Keep migrations driven from the Prisma schema.
- Use Drizzle in repository code when expressive SQL composition or lean runtime access is needed.
- Avoid duplicating schema ownership across both Prisma and Drizzle definitions.

## Excluded Stack
- Supabase is not part of the current platform design.
- Local named-host dev: workspace `dev` scripts are Portless-backed directly without `PORTLESS_PORT`, so local named-host URLs do not include a proxy port. Marketing uses `http://ewatrade.localhost` and dashboard uses `http://ewatrade-dashboard.localhost`. An explicit port on a named host is a blocking Portless defect, not an accepted fallback.
