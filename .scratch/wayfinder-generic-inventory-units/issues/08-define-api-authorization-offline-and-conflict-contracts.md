# Define API, Authorization, Offline, And Conflict Contracts

Parent: [Wayfinder: Catalog Variants, Product Units, And Sellable Offerings](../map.md)

Type: research

Status: resolved

Blocked by: 04, 05, 07, 12

## Question

What API commands, queries, validation errors, permissions, idempotency keys,
offline event envelopes, replay dependencies, stale-configuration handling, and
conflict responses are required for shared catalog/variant/offering setup,
Product unit operations, Service offering selection, sales, receipts,
reservations, adjustments, counts, and transformations?

## Comments

Define commands for catalog setup, configuration-version creation, opening
stock, receipts, sales, reservations, returns, counts, adjustments, and
transformations. Every stock write requires tenant/store scope, actor
authorization, idempotency identity, expected configuration version, and
exact-quantity validation.

Offline events must snapshot entered unit, quantity, factor, and configuration
version. Replay against a changed or archived configuration must return a typed
stale-configuration conflict rather than reinterpret the event. Duplicate
replay returns the original result.

Document stable error codes for invalid precision, insufficient balance, stale
version, duplicate SKU/barcode, forbidden subtype, and invalid transformation.

## Approved Direction

- Every inventory command requires business/Store scope, authorized
  actor/capability, idempotency identity, expected Unit Configuration Version,
  decimal-string quantities, explicit Inventory Unit/Balance Source, and
  source/reason metadata.
- Writes post atomically and return typed invalid-precision, stale-version,
  insufficient-stock, duplicate-identifier, invalid-balance, and
  invalid-transformation errors.
- Queries expose both entered and canonical quantities with versioned unit
  meaning.
- Offline events retain client identity, actor/time, Store/custody, offering,
  unit/version, entered quantity, factor, canonical effect, and replay
  dependencies.
- Replay is ordered and idempotent. Superseded configuration, insufficient
  stock, or balance conflicts become visible review items rather than silent
  corrections.
- Pending offline stock is visibly provisional. The clean cutover removes
  incompatible cached catalog data and queued events.

## Resolution

### API boundaries

Do not recreate one aggregate Retail Ops contract. Separate the command and
query surfaces by responsibility:

- **Catalog**: create Product/Service Catalog Item, update mutable descriptive
  details, manage Variant Option Groups/values and Draft variants, retrieve
  complete catalog configuration, and archive.
- **Offerings**: create Product Unit or Service Offerings, manage Store
  Offering Availability, apply Price Changes, and archive.
- **Inventory configuration**: create Draft from Current, edit Draft units,
  validate Draft, publish Draft, inspect version history, and perform required
  Stock Transition.
- **Inventory operations**: Opening Stock, receipt, reservation, reservation
  release/commit, sale fulfillment, return, count reconciliation, adjustment,
  transfer, custody movement, transformation, and Stock Transition.
- **Commercial Orders**: select Sellable Offerings, accept fixed prices or
  approved quotes, and retain immutable Offering Snapshots.
- **Service Operations**: consume Service Offering selections without gaining
  Product inventory commands.

Never expose a generic unrestricted “post movement” mutation. Purpose-specific
commands own their required fields and allowable ledger shape.

### Mutation contracts

Every mutation carries a common control envelope:

- Business and, when operational, Store scope;
- authenticated actor and optional Stock Custody/session context;
- globally stable client operation identity;
- command schema version and payload hash;
- expected aggregate revision and, for Product stock, expected Unit
  Configuration Version;
- source, reason/note, client occurrence time, and submission time;
- decimal strings for entered quantity, Unit Factor, and canonical effect;
- explicit Sellable Offering, Inventory Unit, and resolved Balance Source
  identities where applicable.

Catalog Item kind, offering subtype, current unit configuration, factor, stock
behavior, price policy, Store availability, capability, and Balance Source are
resolved again on the server. A client snapshot proves what the user intended;
it never authorizes or overrides current server rules.

### Configuration and offering commands

- Creating a Catalog Item requires immutable Product/Service kind and creates
  an explicit default Sellable Variant when no Variant Option Groups exist.
- Variant and unit structure is editable only in Draft state and uses expected
  revision optimistic concurrency.
- Publishing first performs a non-mutating validation query returning all
  representability, identifier, offering, balance, and Stock Transition
  requirements. Publish repeats those checks transactionally.
- A semantic unit change creates replacement offerings rather than retargeting
  used Product Unit Offerings.
- Price Change commands affect future offering selection only and never accept
  a Product Unit Factor as a price input.

### Capability authorization

Domain services enforce capabilities; roles merely grant them:

| Capability | Allows |
| --- | --- |
| `catalog.manage` | Create/edit/archive items, variants, definitions, and Draft configurations |
| `pricing.manage` | Create/archive offerings, apply Price Changes, manage Store availability |
| `inventory.view` | Read configurations, balances, reservations, movements, and reconciliation |
| `inventory.receive` | Opening Stock and external Stock Receipts |
| `inventory.count` | Submit Stock Counts and view reconciliation |
| `inventory.adjust` | Approve/post reasoned Stock Adjustments |
| `inventory.transform` | Post Stock Transformations and required losses separately |
| `inventory.transfer` | Store/custody Stock Transfers |
| `sales.operate` | Select offerings, reserve, sell, release, return, and fulfill allowed lines |

The command verifies Business membership, Store access, resource ownership, and
capability at execution and replay time. Offline capture does not preserve
authorization after access is revoked.

### Idempotency and concurrency

- The client operation identity is unique within Business, Store, and command
  type.
- Repeating the same identity with the same canonical payload hash returns the
  original success or recorded terminal result without another write.
- Reusing an identity with different content returns
  `IDEMPOTENCY_MISMATCH`.
- Mutable Draft/configuration/availability commands require `expectedRevision`;
  mismatch returns `REVISION_CONFLICT` with current revision and a safe
  refetch reference.
- Product stock commands require the expected Unit Configuration Version.
  Supersession returns `STALE_CONFIGURATION`; the server never substitutes the
  Current version.

### Stable error contract

Every failure returns stable `code`, human-safe `message`, `retryable`,
`reviewRequired`, correlation identity, and structured field/resource details.
Required codes include:

- `INVALID_QUANTITY_PRECISION`
- `INVALID_UNIT_FACTOR`
- `STALE_CONFIGURATION`
- `OFFERING_CHANGED`
- `OFFERING_ARCHIVED`
- `PRICE_CHANGED`
- `INSUFFICIENT_STOCK`
- `BALANCE_NOT_FOUND`
- `BALANCE_SOURCE_MISMATCH`
- `DUPLICATE_IDENTIFIER`
- `FORBIDDEN_ITEM_SUBTYPE`
- `INVALID_TRANSFORMATION`
- `RESERVATION_CONFLICT`
- `REVISION_CONFLICT`
- `IDEMPOTENCY_MISMATCH`
- `CAPABILITY_DENIED`
- `CLIENT_SCHEMA_UNSUPPORTED`

Validation errors never silently round, change units, choose another balance,
reprice a line, or convert a Product command into a Service command.

### Query contracts

- Catalog queries expose Catalog Item, Product/Service subtype, Sellable
  Variants and option selections, Sellable Offerings, current prices, Store
  availability, and lifecycle status as separate concepts.
- Product configuration queries expose Draft/Current/Superseded versions,
  Inventory Units, exact factors as strings, precision, Stock Behavior, and
  publication validation.
- Inventory queries return one row per actual Balance Source with entered-unit
  views, exact canonical equivalent, on-hand, reserved, available,
  configuration meaning, custody, and reconciliation status.
- Movement queries expose immutable Stock Operation headers and their entries.
  They never sum raw quantities from incompatible Balance Sources.
- Responses distinguish authoritative server state from Pending Stock
  Operations and conflicts held locally.

### Offline event envelope

Each queued command snapshots:

- event, device, schema-version, and client-operation identities;
- Business, Store, actor, and optional custody/session;
- command type, canonical payload hash, client occurrence time, and dependency
  event identities;
- expected aggregate revision and Unit Configuration Version;
- Sellable Offering identity/revision and accepted price snapshot;
- Inventory Unit, Balance Source, entered decimal quantity, Unit Factor, and
  canonical effect where applicable.

Dependencies form an acyclic replay order: for example, Catalog Item before
variant, variant/configuration before offering, offering before sale, and
reservation before completion. Independent commands may replay independently.

### Replay and conflict policy

1. Reject unsupported event schema before interpreting its payload.
2. Recheck membership, Store access, capability, ownership, lifecycle,
   offering revision/price, configuration version, and current balance.
3. Return the original result for a verified duplicate.
4. Apply a valid command atomically and replace its local provisional state
   with authoritative state.
5. Keep stale configuration, changed offering/price, insufficient balance,
   revision, and authorization failures as visible review items.
6. Permit an explicit user-authored retry as a new operation after reviewing
   current meaning; never mutate and replay the original event silently.
7. Allow discard without fabricating a compensating server Stock Movement for
   an operation that never posted.

The clean cutover increments the local schema, deletes all incompatible
catalog, balance, price, and configuration caches and queued legacy events,
then requires a fresh authoritative sync. There is no old event reader.
