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

The last migration is the destructive early-stage cutover to the complete
Inventory, Commercial Order, offline and Generic Service model. It deletes the
prototype models and preserves no compatibility layer.

## Cutover Result

On 2026-07-19 the owner-approved local development reset removed 45 disposable
prototype Service Job/Line rows and one prototype Request. Prisma then
generated and applied `20260719092903_clean_generic_operations_cutover`;
the migration file was not hand-authored. `bun run db:push --local` reported
the schema in sync, `bun run db:seed:catalog-units` loaded neutral Unit
Definitions, and `prisma migrate status` reported all 22 migrations applied.
No remote or production database was touched.
