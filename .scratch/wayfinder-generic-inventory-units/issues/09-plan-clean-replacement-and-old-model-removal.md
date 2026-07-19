# Plan Clean Replacement And Old-Model Removal

Parent: [Wayfinder: Catalog Variants, Product Units, And Sellable Offerings](../map.md)

Type: task

Status: resolved

Blocked by: 01, 07, 08

## Question

What exact clean-cutover sequence deletes the overloaded ProductVariant unit
model, existing development data, old template/ratio fields, metadata
fallbacks, offline state, API contracts, feed/bag seeds and UI presets, then
creates and seeds only the new catalog/offering/unit model with no legacy
compatibility?

## Comments

Use a destructive development cutover:

1. Remove old clients, API contracts, fallback metadata, seeds, and offline
   payloads.
2. Replace the overloaded ProductVariant/unit schema with the resolved model.
3. Reset disposable development data.
4. Regenerate database clients and apply the required migration/push commands.
5. Seed only neutral Unit Definitions and generic reference data.
6. Clear incompatible local caches and queued events.
7. Verify that no feed/bag preset, compatibility alias, dual write, or old
   reader remains.

Do not create backfills or preservation migrations.

## Approved Direction

- Freeze the old feature shape before replacement.
- Delete feed/bag presets, industry fallbacks, overloaded ProductVariant/unit
  behavior, old ratios/templates/readers, incompatible API/client contracts,
  seeds, caches, and offline payloads.
- Introduce only the resolved catalog, offering, unit, balance, and ledger
  model, then reset disposable development data.
- Run the repository-required database generation, migration, and push
  commands; seed neutral vocabulary only.
- Clear incompatible local state and verify repository-wide deletion and
  acceptance gates.
- Do not build backfills, dual writes, compatibility aliases, fallback readers,
  or preservation migrations.

## Resolution

### Cutover rule

Ship one coordinated breaking replacement. The new schema, domain services,
APIs, dashboard, storefront, mobile state, sync protocol, seeds, tests, and
active documentation must describe one model. Do not deploy any mixed
old/new combination.

### Implementation sequence

1. **Freeze the bridge**: accept no additional work based on ProductVariant
   units, InventoryItem-per-unit balances, Product Unit Templates, conversion
   metadata, feed/bag presets, or legacy Service records.
2. **Build the replacement core**: implement the clean Catalog Item subtypes,
   real Sellable Variants, Sellable Offering subtypes, Product unit
   configuration versions, Inventory Units, Balance Sources, reservations,
   custody, and Stock Operation ledger.
3. **Replace server contracts**: introduce the separated Catalog, Offering,
   Inventory, Commercial Order, and Service Operations APIs with exact,
   capability-checked commands. Remove the aggregate bridge contracts rather
   than adapting them.
4. **Replace clients**: move dashboard, storefront, and mobile to offering and
   Balance Source identities. Replace local persistence and sync envelopes.
5. **Delete old runtime**: remove old models/fields, repository fallbacks,
   metadata dual writes, old routers/schemas, ambiguous UI, conversion utility,
   legacy Service migration, seeds, fixtures, scripts, and tests.
6. **Reset and generate**: reset disposable development databases, generate a
   clean schema baseline, regenerate Prisma artifacts, and run the
   repository-required root `bun db:generate`, `bun db:migrate`, and
   `bun db:push` commands. Do not manually author preservation migrations.
7. **Seed and synchronize**: seed neutral Unit Definitions only, clear
   incompatible mobile state and queues, and perform a fresh authoritative
   sync.
8. **Verify**: pass the complete schema, domain, API, client, offline,
   storefront, reporting, and repository-deletion gates before release.

The implementation may be developed in vertical slices on one branch, but no
partial slice is a deployable compatibility stage.

### Destructive database reset

- Replace the disposable development migration chain with a new generated
  baseline after the replacement schema stabilizes.
- Reset development Catalog Items, variants, offerings, configurations,
  balances, reservations, movements, orders, price history, Service work, and
  related fixtures together so foreign-key-connected bridge data is not
  translated.
- Never create legacy-id columns, temporary mapping tables, backfill jobs,
  metadata readers, or dual-write triggers.
- Generated Prisma output is recreated from the new source schema and never
  edited by hand.

### Server deletion

Delete:

- `ProductUnitTemplate`, `ProductUnitTemplateUnit`, unit-template keys and
  relations;
- ProductVariant unit factors, unit pricing/SKU responsibility, and
  conversion metadata;
- InventoryItem-per-unit and ProductVariant-keyed staff wallet behavior;
- missing-table fallback detection and metadata/durable merge readers;
- `recordUnitConversion` and paired related-variant ledger contracts;
- ProductVariant-selected storefront/order payloads;
- legacy Service ids and migration query;
- old sync event union members and compatibility payload fields;
- feed/bag fallback constants and industry-specific reference data.

No response alias or hidden adapter may preserve these concepts.

### Dashboard, storefront, and routing

- Replace “multiple pricing” and variant conversion controls with the resolved
  Variant, Inventory Unit, Offering, Balance Source, and Stock Transformation
  surfaces.
- Public storefront selection uses Sellable Offerings.
- Business registration, authentication, and authenticated dashboards remain
  on the primary application host.
- Business subdomains are reserved for public storefronts and never route to
  the authenticated dashboard.

### Mobile reset

- Increment the persisted application and event schema version.
- Discard old local Catalog Items, variants-as-units, balances, movements,
  prices, and queued Retail Ops events. Do not run the existing persisted-state
  migration over the rejected structure.
- Preserve authentication and active Business/Store selection only if their
  storage is structurally independent and safe.
- Require a fresh authoritative catalog/inventory sync before stock work.
- Reject old application builds with `CLIENT_SCHEMA_UNSUPPORTED`; do not add an
  old-event interpreter.

### Neutral reference data

Seed optional vocabulary such as Piece, Kilogram, Gram, Litre, Metre, Carton,
Pack, Roll, and Bottle. A seed never supplies a Product factor, Stock Behavior,
price, Product, Service, industry, feed size, or bag fraction. Scenario data
belongs in tests and must include multiple neutral industries.

### Release gates

- No runtime or active-contract search hit remains for feed-bag keys,
  bag-fraction presets, Product Unit Templates, conversion multipliers/ratios,
  legacy Service ids, missing-table fallbacks, or old offline events.
- ProductVariant, if retained as the physical Sellable Variant table, has no
  unit, price, SKU, balance, or conversion responsibility.
- Exact arithmetic, publication, subtype, balance, ledger, reservation,
  custody, transformation, Price Change, and Offering Snapshot invariants pass.
- Capability, ownership, idempotency, revision, stale configuration, and
  unsupported-client tests pass.
- Simple/advanced Product, simple/advanced Service, receipt, shared-pool sale,
  Packaged Stock transformation, mixed Commercial Order, offline conflict,
  dashboard, mobile, and storefront flows pass.
- Active Brain contracts and a superseding ADR describe only the replacement
  model.

Failure before release is handled by fixing forward or resetting the new
development database. It never re-enables the rejected bridge.
