# ADR-0025: Environment-Authoritative Database Contract

- Status: accepted
- Date: 2026-07-28

## Context

EwaTrade generated its local PostgreSQL URL from several aliases and `DB_*`
defaults. The same connection was duplicated across env examples, scripts, and
Compose, while other local projects need independent host ports.

## Decision

- `.env.local` `DATABASE_URL` is the sole source of truth for the default
  development database. It may point to local Docker PostgreSQL or a hosted
  non-production PostgreSQL database.
- `.env.preview` is the sole preview override file. It overlays `.env.local` but
  must provide its own `DATABASE_URL`; legacy remote files and flags are rejected.
- `.env.prod` is the production environment when present. Otherwise,
  `.env.production.local` overlays `.env.production`. Safety comparison,
  production confirmation and Prisma consume that same resolved production URL.
- EwaTrade keeps host port `55436`.
- The shared `local-infra-kit` starts Docker only when the selected URL points
  at local Docker PostgreSQL. It parses that URL and passes its port, database
  name, user, and password to Compose only for the startup process; hosted URLs
  skip Docker startup.
- Mode-specific URL aliases and generated connection fallbacks are removed.
- Public database and dev commands use only local, preview, and production terminology.
- `db:sync` defaults to production → local; `--to-preview` is explicit authorization
  for a preview write and `--from-local` publishes local data to it. Production
  is never an accepted destination.
- Connected non-production database commands require the production
  `DATABASE_URL` for comparison and fail closed when it is missing.
- Local and preview database URLs may be local or hosted. A non-production
  command is blocked when its canonical database identity identifies the
  configured production database. Generic targets use normalized protocol and
  host, effective port, and decoded database path. Neon direct/pooler routes
  share one endpoint identity, PlanetScale uses decoded branch usernames, and
  Supabase uses decoded project references across direct/pooler hosts, roles
  and pool modes. Credentials and query parameters otherwise cannot disguise
  production as a different target.
- GND's MySQL and Redis contract is outside this decision.

## Consequences

- Local EwaTrade can run concurrently with School Clerk and Halaalvest.
- Changing the default development connection requires editing only
  `.env.local`.
- Developers can work without Docker by selecting a hosted non-production URL,
  while explicit production selection and confirmation remain required for the
  production database.
- Compose cannot silently bind a fallback port or initialize a differently
  named database.
