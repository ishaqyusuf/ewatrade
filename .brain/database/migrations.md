# Database Migrations

## Workflow

- Prisma schema files are authoritative.
- Generate migrations with Prisma; never hand-author migration files.
- After a Prisma change, run the repository migration and required database
  push workflow without bypassing data-loss safeguards.
- Applied historical migrations are immutable history and are not deleted merely
  because their models were later removed.
- Since 2026-07-31, `db:generate`, `db:migrate`, `db:pull`, `db:push`, and `db:studio` use `local-infra-kit/bin/db.ts`. Each defaults to local and accepts only `--local`, `--preview`, or `--prod`. `db:sync` defaults to production → local and supports explicit local → preview publishing.
- Since 2026-08-03, local and preview database commands may target local or
  hosted PostgreSQL. Connected non-production commands compare canonical
  database identity against production and refuse a match. Generic identity
  uses normalized protocol/host, effective port and decoded database path;
  Neon direct/pooler routes share one endpoint identity, while Supabase uses
  decoded project references regardless of role or pooler port. Docker starts
  only for a selected local Compose target. Production comparison and Prisma
  share the same `.env.prod` or
  `.env.production.local`-over-production precedence.

## Generic Operations Migration State

Generated and applied locally:

- `20260718212155_clean_catalog_offering_foundation`
- `20260718213251_simple_catalog_idempotency_opening_stock`
- `20260718220457_shared_stock_reservations`
- `20260719053055_inventory_operations_commercial_orders`
- `20260719053406_immutable_offering_snapshots`
- `20260719092903_clean_generic_operations_cutover`
- `20260719180212_add_sellable_variant_description`
- `20260720075654_generic_service_commerce_completion`
- `20260720214348_add_sellable_variant_image`

The last migration is the destructive early-stage cutover to the complete
Inventory, Commercial Order, offline and Generic Service model. It deletes the
prototype models and preserves no compatibility layer.

## Cutover Result

On 2026-07-19 the owner-approved local development reset removed 45 disposable
prototype Service Job/Line rows and one prototype Request. Prisma then
generated and applied `20260719092903_clean_generic_operations_cutover`;
the migration file was not hand-authored. `bun run db:push --local` reported
the schema in sync, `bun run db:seed:catalog-units` loaded neutral Unit
Definitions, and `prisma migrate status` reported all 22 migrations applied at
that cutover.
No remote or production database was touched.

On 2026-07-19 Prisma generated and applied
`20260719180212_add_sellable_variant_description` locally. It adds the nullable
`SellableVariant.description` field used by optional Product/Service variant
details. `bun db:push` then confirmed the local schema was already in sync.
The local migration history now contains 23 applied migrations.

On 2026-07-20 Prisma generated and applied
`20260720075654_generic_service_commerce_completion`. It adds Store Service
settings, express Intake snapshots/charges, append-only Commercial Order
payments, partial-payment state, explicit customer handoff fields, and
scheduled notification dispatch fields. Before commit, the generated migration
was hardened to default legacy Notification Intent channels to `MANUAL` and
backfill already-paid Orders to their full paid total. Local migration history
was reconciled to that corrected, uncommitted artifact; `bun db:migrate`
reported no drift. Local, remote-development and production pushes all reported
the schema in sync, and read-only compatibility checks found no legacy
zero-projection paid Orders or existing Notification Intents in either remote
environment. The local migration history now contains 24 applied migrations.

On 2026-07-20 Prisma generated and applied
`20260720214348_add_sellable_variant_image` locally, adding nullable
`SellableVariant.imageUrl` for the progressive mobile option editor. Local and
remote-development pushes reported the schema in sync. The production push
initially failed with a schema-engine error; a follow-up production `prisma
migrate deploy` exposed the underlying baseline problem: migration
`20260711120000_retail_ops_stock_ledger_foundation` is recorded as pending but
expects the already-removed `Product` relation (`P3018`, PostgreSQL `42P01`). A
guarded `bun run db:push --prod` retry on 2026-07-21 then synchronized the
production schema successfully without force or data-loss flags. The production
schema now includes the image field, but migration history still requires a
dedicated reconciliation before the normal migrate-and-release workflow can run.

## Managed Domains Migration State

On 2026-07-24 Prisma generated and applied
`20260724174525_managed_domains` against the local Docker PostgreSQL database.
The generated migration adds the managed-domain registrant, quote, order,
domain, connection, event and provider-attempt tables plus their lifecycle
enums, tenant/store relations, idempotency constraints and hostname ownership
constraints. `bun db:push` then confirmed the local database was already in
sync, and `prisma migrate deploy` reported no pending migration. The migration
was generated by Prisma and was not hand-authored.

The required `bun run db:push --prod` and `bun run db:push --remote` commands
were also attempted. Both resolved their configured Neon targets but failed
inside the restricted schema engine; elevated shared-database writes were
denied by the safety gate. No production or remote-development schema change
was confirmed. Production and remote-development push remain deployment
blockers.

## Customer Directory Migration State

On 2026-07-24 Prisma generated and applied
`20260724202014_customer_directory` locally. It adds the tenant-scoped
`Customer` directory, normalized phone/email uniqueness, search/order indexes,
and the cascading Tenant relation. A direct profile-loaded `prisma db push`
confirmed the local schema is in sync; the root local wrapper could not see the
already-running Docker engine from its restricted preflight.

The required production and remote-development pushes were attempted. Both
resolved their configured Neon targets but failed with the existing restricted
schema-engine error, so no shared customer-directory deployment is confirmed.

## Owner-Controlled Offline Policy State

On 2026-07-24 the offline policy was stored in the existing Tenant `metadata`
JSON field as `offlineOperationsEnabled`. No Prisma model or relationship
changed, so the final implementation requires no migration or database push.
An earlier scalar-column design was abandoned before completion after local
Docker was unavailable and shared-schema pushes failed with the existing
restricted schema-engine error.

On 2026-07-25 optional staff approval was added as
`Tenant.metadata.offlineApprovalRequired` and staged work reused the existing
`OfflineCommand.REVIEW_REQUIRED` plus `OfflineConflictReview` records. The
final design made no Prisma model, enum, or relationship change and therefore
requires no migration. Prisma format/generate completed; an abandoned
schema-expansion attempt did not produce a migration. Local Docker remained
unavailable, while production and remote push attempts reached Neon and failed
with the existing schema-engine error before any confirmed write.

## Tenant-Sequential Order Number Migration State

On 2026-07-24 Prisma generated and applied
`20260724225940_tenant_sequential_order_numbers` locally after a read-only
preflight found no duplicate Tenant/order-number pairs. It adds
`Tenant.lastCommercialOrderSequence`, replaces Store-scoped Order-number
uniqueness with Tenant-scoped uniqueness, and leaves all existing `EO-*`
references unchanged. Both the default and explicit local `db:push` profiles
confirmed the local schema is in sync.

The required production and remote-development pushes were attempted. Both
resolved their configured Neon targets but failed with the existing restricted
schema-engine error. An elevated production retry was denied by the safety
gate, so no shared-database schema change is confirmed.

## Commercial Order Delivery Scheduling Migration State

On 2026-07-25 the Prisma schema added nullable
`CommercialOrder.deliveryDueAt`, Store-scoped
`CommercialOrderReminderSettings`, recipient-level
`CommercialOrderReminderDelivery`, and reminder timing/status enums. Prisma
format and generation completed successfully.

The same pending delivery-scheduling schema batch now also includes
`CommercialOrderFulfillmentCommand`, which persists tenant-scoped bulk
fulfillment idempotency and the original command result.

The required root `bun run db:migrate` workflow was attempted, but no Docker
engine was reachable and the host has no Docker application to launch. The
wait was stopped without generating or applying a migration. The required
local `bun run db:push --local` attempt reached the same Docker preflight and
was also stopped. No migration file was hand-authored, and no local,
remote-development, or production schema write is claimed. Migration
generation/application and the required push workflow remain release blockers.

After the fulfillment-command receipt was added, the required workflows were
attempted again. `bun db:migrate` and `bun run db:push --local` remained blocked
by the unavailable Docker engine. The sandboxed production push failed in the
schema engine, and its elevated retry was denied because this task did not
explicitly authorize a shared production mutation. The elevated
remote-development push reached Neon but stopped at Prisma's data-loss safeguard
for the already-pending Tenant/order-number uniqueness change; no
`--accept-data-loss` override was used. No database write is claimed.
# Hybrid QA cleanup

- Adds tenant QA lifecycle fields and global purge-run receipts. Apply the
  migration workflow, then local, production, and remote-development schema
  pushes before enabling cleanup.
