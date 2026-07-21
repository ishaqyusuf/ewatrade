# Database Migrations

## Workflow

- Prisma schema files are authoritative.
- Generate migrations with Prisma; never hand-author migration files.
- After a Prisma change, run the repository migration and required database
  push workflow without bypassing data-loss safeguards.
- Applied historical migrations are immutable history and are not deleted merely
  because their models were later removed.

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
