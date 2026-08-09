# AI Rules

## Purpose
Repository-specific rules for AI contributors.

## Rules
- Read relevant Brain docs before making architecture-sensitive changes.
- Do not assume Supabase services, APIs, or auth flows exist.
- Keep Prisma as schema source of truth.
- Use Drizzle as an implementation detail behind repositories, not as a second schema authority.
- Add ADRs for major stack or architecture changes.
- Reuse an already-running development stack when available. If development
  runtime is required and is not already running, start the required root
  `bun run dev` profile in a dedicated managed terminal session and retain the
  session for logs and shutdown.
- For local mobile operations QA, use
  `bun run dev --local -f mobile api jobs dashboard`. The API target is
  mandatory because the Turbo `dev` task does not add workspace dependencies.
- For full local cross-surface QA, use
  `bun run dev --local -f mobile api jobs dashboard marketing storefront pos`.
  Do not start the same workspaces separately.
- Use Portless website URLs without explicit ports. The canonical local marketing and dashboard URLs are `https://ewatrade.localhost` and `https://ewatrade-dashboard.localhost`.
- Treat `.env` plus exactly one selected root profile file as the complete
  environment contract: `.env.local`, `.env.dev`, `.env.preview`, or
  `.env.production`. Every profile file must own its `DATABASE_URL`; do not add
  filename aliases, package-path scanning, mode-specific URL aliases,
  database-port registries, or script fallbacks. For EwaTrade, `.env.local`
  always selects the Neon non-production development database. Never start,
  require, or fall back to local Docker/PostgreSQL; the EwaTrade profile loader
  must reject non-Neon local-mode URLs and every non-production profile must
  reject loopback database hosts. Connected non-production commands must fail
  closed when `.env.production` cannot identify production or when the selected
  target resolves to it.
- Treat any Portless URL that gains an explicit port, such as `ewatrade.localhost:1441`, as a bug. Diagnose and fix the Portless setup before proceeding with website work.
- After any Prisma schema/database update, follow the repository migration
  workflow and run `bun run db:push --local` against the Neon development
  database. Run preview or production database commands only when the user has
  explicitly authorized that target and rollout.
