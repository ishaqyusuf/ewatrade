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
- Use Portless website URLs without explicit ports. The canonical local marketing and dashboard URLs are `http://ewatrade.localhost` and `http://ewatrade-dashboard.localhost`.
- Treat any Portless URL that gains an explicit port, such as `ewatrade.localhost:1441`, as a bug. Diagnose and fix the Portless setup before proceeding with website work.
- After any Prisma schema/database update, follow the repository migration workflow, then run `bun run db:push --local` and `bun run db:push --prod`, and also attempt `bun run db:push --remote`.
