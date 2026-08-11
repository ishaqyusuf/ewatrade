# Database Migrations

## Workflow

- Prisma schema files are authoritative.
- Generate migrations with Prisma; never hand-author migration files.
- After a Prisma change, run the repository migration and required database
  push workflow without bypassing data-loss safeguards.
- Applied historical migrations are immutable history and are not deleted merely
  because their models were later removed.
- Since 2026-07-31, `db:generate`, `db:migrate`, `db:pull`, `db:push`, and `db:studio` use `local-infra-kit/bin/db.ts`. Each defaults to local and accepts only `--local`, `--dev`, `--preview`, or `--prod`. `db:sync` defaults to production → local and supports explicit local → preview publishing.
- Since 2026-08-09, EwaTrade's `.env.local` targets its hosted Neon development
  database. The database-profile loader rejects non-Neon local-mode URLs, so
  local Docker/PostgreSQL is not an allowed fallback; every other
  non-production profile also rejects loopback hosts. Connected non-production
  commands compare canonical
  database identity against production and refuse a match. Generic identity
  uses normalized protocol/host, effective port and decoded database path;
  Neon direct/pooler routes share one endpoint identity, while Supabase uses
  decoded project references regardless of role or pooler port.
- Since 2026-08-03, root tooling loads `.env` plus exactly one of `.env.local`,
  `.env.dev`, `.env.preview`, or `.env.production`. Each profile file owns its
  `DATABASE_URL`; preview does not inherit local values, and production
  comparison and Prisma use only `.env.production`.

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

## Prescription Commerce Migration State

On 2026-08-09 the Prisma source schema was expanded with the shared Commerce
Quote aggregate and Prescription Commerce setup, request, media, transcription,
review, payment, pickup, delivery, WhatsApp, privacy, incident, retention, and
usage models. Prisma format and generation completed successfully. The
repository also contains an idempotent Service Quote backfill script that maps
legacy immutable Service Quote versions into Commerce Quotes before the legacy
model is contracted.

The same pending Prescription Commerce schema batch includes refund-provider
dispatch state, dispatch count, and claim timestamps used to distinguish
never-dispatched work, indeterminate external outcomes, manual review, and
confirmed results. Prisma format and generation completed after this addition;
it remains covered by the same unapproved shared-database migration gate below.

The pending batch now also includes `PrescriptionRetentionPolicy.auditEvidenceDays`
and `PrescriptionSensitiveAccessEvent`. Prisma format/generation and source
typechecks pass; no shared schema application is claimed. The rollout must
backfill the audit-retention default before enabling the retention job and must
verify access-event indexes and Tenant/Store foreign keys in the same approved
change window.

The pending batch also adds privacy-request verifier/evidence columns from the
final conformance review. Retention execution now carries Tenant and Store
through every candidate read and redaction write; Store-only rollout is not
supported.

On 2026-08-09 the owner confirmed that `.env.local` is the Neon development
database and authorized the development rollout. `bun run db:migrate --local`
reached Neon but Prisma detected broad historical drift and requested a reset;
the reset was refused. `bun run db:push --local` then applied the current Prisma
schema without a data-loss override and reported the schema in sync. The
idempotent Service Quote backfill ran twice and reported zero Commerce, legacy,
or migrated rows on this empty development dataset. After the schema was
proven current, the historical migration ledger was reconciled; Prisma reports
28 migrations and an up-to-date Neon development schema.

Production was not touched. Production Service Quote reconciliation, legacy
model contraction, provider canaries, and the separately authorized production
migration remain release gates. Local Docker/PostgreSQL was not used and must
not be used as a fallback under ADR-0028.

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

ADR-0028 now supersedes Docker as the local target. The 2026-08-09 guarded
`db:push --local` synchronized the complete current Prisma schema, including
these scheduling fields, to Neon development without reset or data-loss flags.
A release migration artifact and production rollout remain separately
authorized gates.

## Service Commerce Capability Profile Migration State

On 2026-08-10 the Prisma source schema added the Store-unique
`ServiceCommerceStoreProfile`, append-only
`ServiceCommerceStoreAuditEvent`, their lifecycle/adoption enums, and explicit
Tenant/Store relations. The profile also carries a server-owned
`policyRestrictedCapabilities` allowlist; setup clients cannot mutate it and
Ticket 11 owns its future evidence-backed command. Prisma format/generation and
focused package, DB, API and dashboard typechecks passed.

The required `bun db:migrate` used the verified `.env.local` Neon development
profile and skipped local PostgreSQL/Docker. Prisma detected broad pre-existing
schema-to-ledger drift across the earlier Prescription Commerce graph and
requested a destructive reset; the reset was refused. `bun db:push` then
applied this additive profile schema non-destructively and reported the Neon
development schema in sync. A focused Neon test raced initial profile creation
and revisioned activation, proved typed loser conflicts, Tenant/Store isolation
and append-only audit, then atomically removed its run-owned fixture.

No migration file was hand-authored and production was not touched. A
deployable migration artifact plus ledger reconciliation remains an explicit
release gate; the development schema synchronization is not represented as
production migration evidence.

## Service Commerce Inquiry Migration State

On 2026-08-10 Ticket 03 added `CommerceInquiry`, ordered
`CommerceInquiryLine`, `CommerceInquiryAuditEvent`, their explicit
lifecycle/demand/channel/audit enums, Tenant/Store relations and
`COMMERCE_INQUIRY` as a Commerce Quote source. It also adds the one-per-Version
digest-only `CommerceQuoteReplayAccessToken` used for safe issuance replay.
Prisma format, generation and validation passed.

The required root migration workflow targeted the verified `.env.local` Neon
development database and explicitly skipped local PostgreSQL/Docker. The first
sandboxed attempts failed at network schema-engine access; the approved network
retry of `bun db:push` applied the additive schema, `bun db:migrate` completed
against the same verified profile without a reset, and the final push reported
the database already in sync. No data-loss override, manual migration file,
local database or production database was used. A deployable production
migration artifact remains a separate release gate.

## Service Commerce Quote Option Migration State

On 2026-08-10 Ticket 06 began its expand phase with generated migration
`20260810203510_commerce_quote_options`. It adds immutable
`CommerceQuoteOption`, one-per-Version `CommerceQuoteOptionSelection`, and the
nullable compatibility link from existing Quote lines to their owning Option.
The nullable link deliberately preserves existing immutable Quote Versions;
the implemented runtime exposes those versions as one synthetic default Option
without rewriting historical Quote/Order snapshots. Every new shared issuer
and Pharmacy delivery-fee revision now persists an owning Option for each line.
No destructive data backfill is required before expand-phase compatibility;
production reconciliation remains mandatory before any future contraction.

The required root workflow used only the verified `.env.local` Neon
development profile and explicitly skipped local PostgreSQL/Docker. Prisma
generated and applied the migration, and `bun db:push` then reported the
development database already synchronized. No migration SQL was hand-authored,
no reset or data-loss override was used, and no production database was
touched. Runtime issuance, idempotent selection, selected-only acceptance and
the private prepare/release transaction are source-complete. The 2026-08-11
follow-up revalidation keeps legacy commercial alternative lines visible but
outside payable totals, reservations, Orders and payments, and proves a
pharmacist-selected substitute becomes exactly one included commercial Order
line. The post-release verified-Neon matrix passes 6 tests and 126 assertions,
and desktop/mobile browser acceptance through the typed tRPC boundary is
complete with the run-owned fixture removed. Ticket 06 is complete; deployable
production rollout remains separately authorized and open.

## Service Commerce Vertical Policy Migration State

On 2026-08-10 Ticket 11 added typed vertical/channel/subject/outcome/audit
enums, `ServiceCommercePolicyDecision`,
`ServiceCommercePolicyAuditEvent`, explicit Tenant/Store relations and
`CommerceInquiry.vertical`. This is additive expand-phase persistence; the
profile restriction allowlist remains temporarily as a restriction-only
compatibility field.

The required root workflow used only the verified `.env.local` Neon
development profile and skipped local PostgreSQL/Docker. Initial sandboxed
schema-engine access failed. The approved network retry of `bun db:push`
applied the additive schema without a reset or data-loss flag and reported the
development schema synchronized. `bun db:migrate` then truthfully detected the
known broad schema-to-ledger drift across previously pushed Prescription/
Service Commerce tables and requested a destructive reset; the reset was
refused. No migration file was hand-authored and no production database was
touched.

A dedicated run-owned Neon policy fixture passed Store/Tenant isolation,
jurisdiction change/missing jurisdiction, expiry, revocation, Nigeria Pharmacy
WhatsApp default prohibition plus explicit QA written approval, and independent
Catalog subjects with 9 assertions. The established Service, Inquiry, profile,
pickup and delivery compatibility matrix passed all 10 scenarios after the
final policy remediation. Nine passed in the combined verified-Neon run; the
manual-fee delivery scenario hit a transient Neon transaction-start `P2028`
and then passed its isolated rerun with 17 assertions. A deployable migration
artifact, ledger reconciliation and production rollout remain separately
authorized gates.
## Service Commerce Progressive Catalog Migration State

On 2026-08-10 Ticket 03A added the generated Progressive Catalog persistence:
`CatalogSourceLineLink`, `CatalogVerifiedAlias`,
`CatalogAvailabilityAttestation`, `CatalogPricePromotion`, their typed enums,
and Quote-line availability attribution. The same generated migration also
captures the previously synchronized Prescription/Service Commerce foundation
that had been absent from the historical ledger.

At the owner's explicit request, only the verified `.env.local` Neon
development database was reset. The canonical profile confirmed the Neon target
was not production and skipped local PostgreSQL/Docker. Prisma reapplied the 28
historical migrations, then `bun db:migrate` generated and applied
`20260810144357_service_commerce_prescription_and_catalog_foundation` as
migration 29. `bun db:push` reported the database already synchronized. No
migration SQL was hand-authored and no production database was touched.

The run-owned Neon acceptance passed staff and web Product-inquiry paths
through fingerprinted source snapshots, operator-confirmed aliases, private
draft capture, quantity-bounded expiring manual availability and immutable
Quote creation. It also passed a Service Request through the same private-draft
and Quote boundary; the staff Product path additionally proved explicit
reusable-price promotion without Store availability or stock-source creation.
An additional active inventory-configured Offering path proved tracked
availability snapshots without creating a balance. All four scenarios passed
together with 15 assertions. Production rollout remains a separately
authorized release action.

## Customer Channels And Generic Media Migration State

On 2026-08-10 the canonical verified `.env.local` Neon development workflow
generated and applied two additive Prisma migrations:

- `20260810165318_customer_channels_and_store_team` adds Store team assignments,
  assignment audit, stable Customer entry points and entry-point audit.
- `20260810180355_generic_customer_request_media` adds private Media Assets,
  typed Source Attachments, revisioned Verified Observations, media audit,
  disabled-by-default attachment readiness, optional Prescription/Catalog
  provenance links and resolved inbound vertical attribution.

`bun db:migrate` generated both artifacts through Prisma; no migration SQL was
hand-authored. `bun db:push` reported the verified development database in sync.
Neither operation used Docker/local PostgreSQL, a reset, a data-loss flag or a
production database.

The run-owned generic-media Neon acceptance passed the non-Pharmacy bag-image
repository seam through safe private media, replay, cross-scope rejection,
human observation and private Catalog draft provenance with 7 assertions.
Complete cross-source public-web/generic-WhatsApp acceptance, authenticated
browser QA, live Meta/storage/scanner canaries and production rollout remain
open gates.

## Service Commerce Catalog Graduation Migration State

On 2026-08-11 the canonical verified `.env.local` Neon development workflow
generated and applied
`20260811000805_service_commerce_catalog_graduation`. The additive migration
adds Offering revision, Service booking policy/duration and distinct Catalog
graduation/publication audit events. `bun db:push` then reported the development
schema in sync. No Docker/local PostgreSQL, production database, reset,
data-loss override or hand-authored migration SQL was used.

The run-owned acceptance passed eight assertions across a pre-graduation
manual Product Quote/Order with no reservation, same-ID Product graduation with
five units of explicit opening stock, separate publication and a
post-graduation tracked Quote/Order with one reservation against the verified
Balance Source. The fixture was removed atomically. Production reconciliation
and rollout remain separately authorized.

## Service Commerce Quote Release Approval Migration State

On 2026-08-11 the canonical verified `.env.local` Neon development workflow
generated and applied
`20260811021755_service_commerce_quote_release_approval`. The additive migration
adds Store release-policy/receipt/audit persistence, exact Quote-Version
approval/audit persistence, typed release modes and decision lifecycles plus
their Tenant, Store, Membership, Quote and Version relations.
Runtime decisions now use bounded Serializable transactions with one conflict
retry, while direct and queue reconciliation atomically mark stale pending
records `SUPERSEDED`; this required no follow-up schema change.

`bun db:migrate` generated the artifact through Prisma and `bun db:push`
reported the verified development schema already synchronized. No migration SQL
was hand-authored. No Docker/local PostgreSQL, production database, reset,
data-loss override or live provider operation was used.

The run-owned Neon acceptance passed 2 tests and 17 assertions across private
preparation, creator denial, a different selected approver, fresh concurrent
approval and exact replay, atomic source/public release, rejection, immutable
revision and decision-history preservation. The browser-QA Tenant/User fixture
was removed atomically after authenticated desktop/mobile Customer Channels
configuration. Production schema application and business activation remain
separately authorized.

## Service Commerce Booking Migration State

On 2026-08-11 the canonical verified `.env.local` Neon development workflow
generated and applied `20260811072717_service_commerce_booking_lifecycle` and
`20260811074755_service_booking_horizon_alignment`. The first migration adds
Store/Offering booking configuration, resources, availability, holds,
appointments, capability digests, typed history and notification outbox
persistence. The second aligns the database booking horizon default to the
30-day short-lived manage-capability ceiling.

`bun db:migrate` and `bun db:push` both reported the verified development
database in sync. No migration SQL was hand-authored and no Docker/local
PostgreSQL, production database, reset or data-loss override was used. The
run-owned Neon appointment lifecycle passed 1 test and 29 assertions and its
Tenant/User fixture was removed atomically. Production rollout remains
separately authorized.

## Service Commerce Customer Action Migration State

On 2026-08-11 the canonical verified `.env.local` Neon development workflow
generated and applied `20260811100049_service_commerce_customer_actions`. The
additive migration creates digest-only current-action capabilities,
payload-bound execution receipts and the provider-neutral customer
notification intent/attempt/receipt graph, with explicit Tenant/Store/source/
target indexes and uniqueness constraints.

The follow-up additive migration
`20260811110847_service_commerce_customer_notification_receipts` records the
immutable provider Connection on each sent attempt and indexes it with the
provider operation id. This lets delayed Direct Meta status callbacks resolve
the correct generic notification after binding rotation without consulting
mutable active routing state.

`bun db:migrate` applied both generated artifacts and `bun db:push` reported the
verified development database already in sync. No migration SQL was
hand-authored and no Docker/local PostgreSQL, production database, reset or
data-loss override was used. The run-owned Neon action lifecycle passed 1 test
with 6 assertions and removed its Tenant/User fixture atomically. Production
rollout and live provider canaries remain separately authorized.

## Channel-Neutral Intake Attribution Migration State

On 2026-08-10 Prisma generated and applied
`20260810192915_channel_neutral_intake_attribution` through the canonical
verified `.env.local` Neon development profile. It adds typed Service Request
channel origin, nullable staff creator, consent/contact-opt-in facts and
Tenant-idempotent provider event identity across Service Request, Commerce
Inquiry and Prescription Request. Commerce Inquiry user attribution becomes
nullable so public/provider work does not fabricate a User.

`bun db:migrate` generated the artifact; no migration SQL was hand-authored.
After transient Neon connectivity recovered, `bun db:push` reported the
development database already in sync. No Docker/local PostgreSQL, reset,
data-loss flag or production database was used. The run-owned channel-neutral
Neon acceptance passed web Product Inquiry replay, staff Generic Service,
generic WhatsApp Inquiry and exact-Product recovery with 5 assertions.
Complete cross-source media/isolation and browser acceptance remain open.

# Hybrid QA cleanup

- Adds tenant QA lifecycle fields and global purge-run receipts. Apply the
  migration workflow, then local, production, and remote-development schema
  pushes before enabling cleanup.
