# ADR-0025: Environment-Authoritative Database Contract

- Status: accepted
- Date: 2026-07-28

## Context

EwaTrade generated its local PostgreSQL URL from several aliases and `DB_*`
defaults. The same connection was duplicated across env examples, scripts, and
Compose, while other local projects need independent host ports.

## Decision

- Root runtime configuration recognizes exactly five environment files:
  `.env` for shared defaults plus `.env.local`, `.env.dev`, `.env.preview`, and
  `.env.production` for the four explicit profiles. Every command loads `.env`
  followed by exactly one profile file. Prisma and generic root tooling do not
  scan package-level env paths or legacy filename aliases.
- Every profile file owns its `DATABASE_URL`; the value never falls back to
  `.env` or another profile. `.env.local` may point to local Docker PostgreSQL
  or a hosted non-production database, while `.env.dev` represents hosted
  development.
- A hosted runtime may inject `DATABASE_URL` through the process only when the
  selected profile file is absent. If that file exists, even an incomplete
  profile remains authoritative and cannot inherit an injected target.
- `.env.production` is the sole production identity used by safety comparison,
  production confirmation, and Prisma. `.env.prod` and
  `.env.production.local` are ignored.
- EwaTrade keeps host port `55436`.
- The shared `local-infra-kit` starts Docker only when the selected URL points
  at local Docker PostgreSQL. It parses that URL and passes its port, database
  name, user, and password to Compose only for the startup process; hosted URLs
  skip Docker startup.
- Mode-specific URL aliases and generated connection fallbacks are removed.
- Public database and dev commands use local, dev, preview, and production
  terminology. The command flags are `--local`, `--dev`, `--preview`, and
  `--prod`.
- `db:sync` defaults to production → local; `--to-preview` is explicit authorization
  for a preview write and `--from-local` publishes local data to it. Production
  is never an accepted destination.
- Connected non-production database commands require the production
  `DATABASE_URL` for comparison and fail closed when it is missing.
- Local, dev, and preview database URLs may be local or hosted. A non-production
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
- Changing a connection requires editing only its profile file.
- Developers can work without Docker by selecting a hosted non-production URL,
  while explicit production selection and confirmation remain required for the
  production database.
- Compose cannot silently bind a fallback port or initialize a differently
  named database.
