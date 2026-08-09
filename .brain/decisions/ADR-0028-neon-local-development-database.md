# ADR-0028: Neon Is The Local Development Database

- Status: accepted
- Date: 2026-08-09

## Context

ADR-0025 allowed `.env.local` to select either local Docker PostgreSQL or a
hosted non-production database. EwaTrade now has one deliberate development
database: the Neon database identified by `.env.local`. Allowing an implicit
Docker fallback creates two competing development states and makes schema,
fixtures, QA evidence, and migration history depend on which database happened
to be available.

## Decision

- `.env.local` owns the Neon non-production development `DATABASE_URL` and is
  the default profile for local application, test-fixture, Prisma, and browser
  QA work.
- EwaTrade's database-profile loader rejects local-mode URLs whose host is not
  Neon, including loopback and Docker PostgreSQL URLs.
- Every other non-production profile also rejects loopback database hosts, so
  preview/dev commands cannot reintroduce Docker as an alternate target.
- EwaTrade agents and developers must not start, require, or fall back to a
  local Docker/PostgreSQL database. If Neon is temporarily unavailable, retry
  or report the failure; do not silently change database targets.
- Connected local commands retain the production-identity safety comparison.
  A local command must fail closed if `.env.production` is missing or resolves
  to the same canonical database identity.
- `db:push --local`, migration status, and approved development backfills apply
  only to the Neon development database selected by `.env.local`.
- Production and preview database writes are separate release operations and
  require explicit authorization. A local schema change does not authorize a
  production push, migration, backfill, contraction, reset, or data-loss flag.
- Destructive reset or force/data-loss flags remain prohibited without explicit
  approval and a reviewed recovery plan, including on the Neon development
  database.
- Generic `local-infra-kit` support for other repositories is unchanged. This
  ADR narrows EwaTrade's operational selection and supersedes ADR-0025 only
  where ADR-0025 permits `.env.local` to select Docker.

## Consequences

- Local runtime and authenticated QA use the same shared Neon development
  state, so migration history and fixtures are consistent across contributors.
- Development requires network access to Neon and has no offline database
  fallback.
- Transient Neon errors are visible and recoverable without creating a second
  schema history.
- Production remains protected from development commands and from implied
  release authorization.
