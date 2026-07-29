# ADR-0025: Environment-Authoritative Local Database Contract

- Status: accepted
- Date: 2026-07-28

## Context

EwaTrade generated its local PostgreSQL URL from several aliases and `DB_*`
defaults. The same connection was duplicated across env examples, scripts, and
Compose, while other local projects need independent host ports.

## Decision

- `.env.local` `DATABASE_URL` is the sole source of truth for local PostgreSQL.
- EwaTrade keeps host port `55436`.
- The shared `local-infra-kit` parses the URL and passes its port, database
  name, user, and password to Compose only for the startup process.
- Mode-specific URL aliases and generated connection fallbacks are removed.
- Missing or mode-incompatible `DATABASE_URL` values fail closed.
- GND's MySQL and Redis contract is outside this decision.

## Consequences

- Local EwaTrade can run concurrently with School Clerk and Halaalvest.
- Changing the local connection requires editing only `.env.local`.
- Compose cannot silently bind a fallback port or initialize a differently
  named database.
