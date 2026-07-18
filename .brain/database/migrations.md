# Database Migrations

## Purpose
Document migration ownership and safety rules.

## How To Use
- Update when migration tooling or rollout process changes.

## Strategy
- Migrations are owned by Prisma.
- Schema changes should flow from Prisma schema updates into generated migrations.
- Drizzle runtime queries must stay compatible with the Prisma-managed schema.
- PostgreSQL is the canonical migration target for all environments.
- Local development uses the configured hosted Neon branch `DATABASE_URL` before applying Prisma migrations.

## Safety Rules
- Review tenant isolation impact before applying schema changes.
- Avoid destructive migrations without data backfill/transition planning.
- Record major schema shifts in an ADR.

## Prisma Migration Workflow Rules

- Use the repository DB push command against the intended database profile for schema readiness checks.
- Use `bun run db:push --local` for local schema readiness checks, `bun run db:push --remote-dev` for the remote development database, and `bun run db:push --prod` only for explicitly requested production validation/push after confirming the target database and risk. Do not force data-loss prompts or destructive changes without approval.
- If repository root scripts `db:migrate` and `db:push` exist, run `bun db:migrate` and `bun db:push` after Prisma schema/database updates.
- This repository exposes `db:start`, `db:generate`, `db:migrate`, `db:migrate:deploy`, and profile-aware `db:push`; use the matching environment-safe migration command plus the intended profile flag when a schema push is explicitly required.
- Do not manually create migration files; use the repository scripts and Prisma workflow.
- Keep migration commands aligned with root `package.json` and `packages/db` scripts.

## TODO
- Add environment rollout notes once staging/production infrastructure exists.

## Current Commands
- `bun run db:start` - start the local Docker PostgreSQL service for the local profile
- `bun run db:generate` - generate Prisma Client from the file-based schema into `packages/db/generated`
- `bunx prisma migrate diff --from-empty --to-schema prisma --script --output prisma/migrations/0001_init/migration.sql` - refresh the baseline SQL migration without a running database
- `bun run db:migrate` / `bun run db:migrate:dev` - create and apply a development migration after starting local PostgreSQL
- `bun run db:migrate:deploy` - apply committed migrations in deployed environments
- `CONFIRM_RETAIL_OPS_REFERENCE_SEED=1 bun run db:seed:retail-ops-reference` - upsert active Retail Ops Starter/Growth/Pro plan rows and system unit-template rows into a selected validation database
- `CONFIRM_RETAIL_OPS_FULL_VALIDATION=1 RETAIL_OPS_VALIDATION_TARGET=<target> bun run db:validate:retail-ops-full` - run the guarded full Retail Ops validation sequence, including generation, schema validation, migration deploy/status, reference seeding, live validation, workflow validation, and optional JSON evidence output
- `CONFIRM_RETAIL_OPS_FULL_VALIDATION=1 RETAIL_OPS_VALIDATION_TARGET=<target> RETAIL_OPS_VALIDATION_DRY_RUN=1 bun run db:validate:retail-ops-full` - validate the full runner guard inputs and print the planned validation sequence without running any validation step
- `bun run db:validate:retail-ops-live` - read-only Retail Ops live validation against a selected migrated database
- `CONFIRM_RETAIL_OPS_WORKFLOW_VALIDATION=1 bun run db:validate:retail-ops-workflows` - write isolated Retail Ops validation data, exercise migrated repository workflows, and clean up the validation tenant/user unless `KEEP_RETAIL_OPS_WORKFLOW_VALIDATION_DATA=1` is set
- `bun run db:push --local|--remote-dev|--prod` - run Prisma db push against the selected database profile
- `bun run db:studio` - open Prisma Studio against the configured database

## Item-Level Catalog And Service Operations

- `20260717195703_item_level_product_service_catalog` adds `CatalogItemKind`, backfills existing `Product` rows to `PRODUCT`, adds Service item profiles, generic Service Jobs/events/evidence, service request/link/line records, notification intents, order-line kind snapshots, and legacy mapping tables.
- `20260717203905_order_line_cancellation_service_assignment` adds Service Job assignment events/current assignee, order/service-line cancellation fields, the `SALE_REVERSAL` inventory movement type, and order payment event records.
- `bun --cwd packages/db migrate:legacy-services --dry-run` previews bounded legacy metadata conversion without writing.
- `bun --cwd packages/db migrate:legacy-services --apply` performs the idempotent conversion while preserving legacy ids and opaque public tokens.
- The 2026-07-18 validation run applied `bun db:migrate` and `bun db:push` successfully. Both reported the configured database in sync.
- The final legacy dry-run and apply each scanned nine stores, skipped nine already migrated/no-legacy stores, migrated zero, and emitted no private customer, token, evidence, or note values.

## Retail Ops Static Readiness Snapshot
- Static source evidence currently shows committed Prisma source models, generated Prisma model files, and migration SQL files for the Retail Ops stock ledger, subscription/billing, sync/offline-device, share-link, closeout, staff wallet/profile, customer book, and product-unit/price-history foundations.
- Static Prisma schema validation passed from `packages/db` with `node node_modules/prisma/build/index.js validate --config prisma.config.ts` on 2026-07-11. This validates the file-based schema shape only; it does not apply migrations or prove a live database matches the schema.
- Static migration SQL safety scan found no `DROP`, `TRUNCATE`, `DELETE FROM`, or `ALTER TABLE ... DROP` statements across the current Retail Ops migration files on 2026-07-11. This is only a destructive-operation text scan, not a substitute for migration dry-run or live apply validation.
- Repository bridges currently guard undeployed durable tables with Prisma `P2021`/`P2022` fallback paths for stock ledger, billing/subscription/offline devices, closeout, and sync flows.
- This snapshot is not proof that migrations have been applied to any live database. Live validation still requires running migrations against the target database, seeding active plan/template rows where needed, and executing targeted workflow checks against that migrated database.

## Retail Ops Live Validation Runbook

Use this only when a real validation database is intentionally selected and `DATABASE_URL` points to that target. Do not run these commands against production without a backup and an approved rollout window.

For a safe command-plan preview, use `CONFIRM_RETAIL_OPS_FULL_VALIDATION=1 RETAIL_OPS_VALIDATION_TARGET=<target> RETAIL_OPS_VALIDATION_DRY_RUN=1 bun run db:validate:retail-ops-full`. For a one-command evidence run on a validation database, use `CONFIRM_RETAIL_OPS_FULL_VALIDATION=1 RETAIL_OPS_VALIDATION_TARGET=<target> RETAIL_OPS_VALIDATION_REPORT_PATH=retail-ops-validation-report.json bun run db:validate:retail-ops-full`. The full runner refuses likely production targets unless `ALLOW_PRODUCTION_RETAIL_OPS_VALIDATION=1` is also set, and it stops at the first failed step.

1. Preflight the local source:
   - Run `bun run db:generate`.
   - Run `node node_modules/prisma/build/index.js validate --config prisma.config.ts` from `packages/db`.
   - Expected evidence: generated client completes, Prisma schema validates, and generated model files still include the Retail Ops durable models.

2. Apply committed migrations:
   - Run `bun run db:migrate:deploy`.
   - Run `node node_modules/prisma/build/index.js migrate status --config prisma.config.ts` from `packages/db`.
   - Run `bun run db:validate:retail-ops-live` to execute the read-only Retail Ops live validation helper against the selected `DATABASE_URL`.
   - Expected evidence: every committed migration is applied on the target database, including the `2026071112*` through `2026071117*` Retail Ops migrations.

3. Verify reference data:
   - Confirm active Starter, Growth, and Pro `SubscriptionPlan` rows exist or create them through the approved seed/admin path.
   - Confirm any desired system `ProductUnitTemplate` rows exist, or document that the app is intentionally using fallback unit-template presets.
   - If the selected validation database needs the standard MVP reference rows, run `CONFIRM_RETAIL_OPS_REFERENCE_SEED=1 bun run db:seed:retail-ops-reference`.
   - Expected evidence: `bun run db:validate:retail-ops-live` passes the subscription-plan check, warns or passes the unit-template check, `retailOps.subscription` uses durable plan rows when present, and `retailOps.unitTemplates` returns durable templates or documented fallback presets.

4. Run migrated workflow checks:
   - Run `CONFIRM_RETAIL_OPS_WORKFLOW_VALIDATION=1 bun run db:validate:retail-ops-workflows` after migrations and reference data are in place.
   - Product setup with unit-template linkage writes product, variant, inventory, conversion ratio, and optional template ids.
   - Price update and sale-at-time lookup read/write durable `ProductUnitPriceHistory`.
   - Unit conversion and stock adjustment create durable `InventoryMovement` rows for external-id-backed requests.
   - Closeout writes durable `RetailOpsCloseout`, payment declarations, stock declarations, and review rows.
   - Offline sync writes durable `OfflineDevice`, `RetailOpsSyncRun`, and `RetailOpsSyncEvent` rows and returns sync conflict resolution guidance.
   - Billing checkout intent writes `BillingCheckoutSession`; normalized provider-event submission writes `BillingProviderEvent` and upserts subscription/invoice state.
   - Expected evidence: each workflow writes the durable rows above and still preserves the metadata fallback behavior when a durable table is intentionally unavailable.

5. Run broad code gates:
   - Run `bun run typecheck`.
   - Run targeted API/dashboard/mobile checks that cover the workflows above.
   - Expected evidence: broad typecheck passes, and targeted workflow tests or manual records prove the migrated database paths.

6. Validate provider-native billing only after provider selection:
   - Add or enable the provider adapter for Stripe, App Store, Play Store, manual billing, or another selected provider.
   - Verify provider-native signature or receipt validation before submitting the normalized event to `POST /api/billing/provider-events`.
   - Expected evidence: provider-native events are verified by the adapter, normalized events are idempotently recorded, and app clients never receive provider-specific payload fields.
