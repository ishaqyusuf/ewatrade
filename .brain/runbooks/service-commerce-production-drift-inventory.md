# Service Commerce Production Drift Inventory

**Status:** source-verified offline; no production execution is authorized by
this runbook.

## Purpose

This command captures bounded, redacted evidence about a production database
whose Prisma migration ledger may not match its installed schema. It is an
observation tool only. It never invokes Prisma migration, schema-engine, job,
provider, backfill, switch or contraction operations, and its output is not a
production-readiness verdict.

The official entry point is the root `db:drift-inventory` script. That script
loads the production profile through `scripts/with-workspace-env.mjs` before
running the DB-package collector. The DB package deliberately has no directly
advertised inventory script.

## Separate Authorization And Credential

Do not run the command until a DB operator has provisioned and independently
approved a dedicated `PRODUCTION_READONLY_DATABASE_URL` for the exact
production target. The role must:

- use an explicit hosted PostgreSQL host, database, username and password;
- require certificate-verified TLS and enable Node Postgres channel binding
  when the server offers SCRAM-SHA-256-PLUS;
- differ from the application writer identity;
- have `SELECT` on the fixed inventory relations and no application-table
  write privilege;
- have no database `CREATE`/`TEMP`, non-system-schema `CREATE`, writable
  table/view/foreign-table/sequence privilege, executable security-definer
  function, owned non-system object, superuser, create-role, create-database,
  replication or bypass-RLS authority; and
- expose no connection-option override other than strict allowlisted TLS
  settings.

The operator must also provide these facts outside version control:

- `SERVICE_COMMERCE_PRODUCTION_DRIFT_INVENTORY_AUTHORIZED=1` from a new,
  inventory-specific approval;
- `SERVICE_COMMERCE_PRODUCTION_DRIFT_INVENTORY_TARGET_FINGERPRINT` matching the
  approved read-only target and identity; and
- `PRODUCTION_READONLY_DATABASE_URL` through the approved secret channel.

The prior 2026-08-11 production preflight authorization does not authorize a
future execution of this command. Never put a connection string, password or
raw SQL in command arguments.

## Read Boundary

One dedicated PostgreSQL connection performs one transaction:

1. `REPEATABLE READ READ ONLY` begins before any inventory query.
2. Five-second statement, one-second lock and ten-second idle transaction
   limits are applied.
3. PostgreSQL must report `transaction_read_only = on`.
4. The dedicated role is checked globally for elevated, database,
   non-system-schema and non-system-table write authority.
5. Only the fixed migration, Store, Catalog foundation, legacy Service Quote,
   shared Commerce Quote and Commercial Order relation allowlist is inspected.
6. Migration rows, columns, indexes and constraints are bounded. Any bound
   overflow fails closed rather than returning partial or invented status.
7. Only fixed aggregate counts are read. Absent graphs are reported as
   `UNAVAILABLE`, never zero.
8. The transaction is explicitly rolled back; unexpected errors are reduced
   to safe reason codes and the connection is closed.

Output may contain relation/migration names already known to this release,
allowlisted column/index/constraint metadata, fixed aggregate counts, the
approved target fingerprint and safe state/reason codes. It never contains
URLs, credentials, migration logs, raw database errors, row samples, customer
or provider data, defaults, predicates, DDL or arbitrary catalog objects.

## Execution Procedure

1. Record the new read-only inventory authorization and its approved target
   fingerprint.
2. Provision and independently verify the least-privilege credential.
3. Run the focused offline tests and review the fixed relation/migration
   allowlists against the release being inspected.
4. Inject the three inventory-specific environment facts through the approved
   secret/operator channel.
5. From the repository root, run `bun run db:drift-inventory` with no command
   arguments.
6. Retain only its deterministic redacted JSON. Treat any nonzero exit,
   `BLOCKED`, `UNAVAILABLE`, truncation, target mismatch, privilege failure or
   unexpected relation state as a stop condition.
7. Do not perform migration reconciliation or any write from this result.
   Draft a separate reviewed plan and obtain separate write authorization.

## Current Evidence

The collector and CLI pass focused offline tests for profile/target arming,
hostless/loopback/connection-option rejection, distinct identity, global
least-privilege enforcement, strict read-only query order, rollback, redaction,
known SQLSTATE handling, absent graphs and fail-closed bounds. No production
database or provider was contacted while implementing this command.
