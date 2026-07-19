# ADR-0013: Generic Catalog, Inventory Units, And Stock Operations

## Status

Accepted and implemented. Catalog/Offerings, exact inventory, the ledger,
Commercial Order snapshots, offline/reports, dashboard/mobile clients, version
management, neutral seeds, prototype deletion and the clean local database
cutover are complete. Behavioral validation is intentionally assigned to a
separate testing goal.

## Context

The current inventory bridge uses ProductVariant as customer option, selling
unit, SKU/price row, conversion ratio, and independently balanced stock bucket.
Integer quantities, binary-number multipliers, unit templates, feed presets,
metadata fallbacks, and paired conversion movements make one example appear to
be the domain model. Equivalent selling units cannot safely share stock, while
separately prepared packages cannot be distinguished from virtual units.

The project is early and development data is disposable. Preserving this bridge
would require compatibility aliases, dual reads/writes, backfills, and old
offline-event interpretation for semantics the owner has rejected.

## Decision

- Catalog Item is business-owned and permanently Product or Service.
- Sellable Variant represents customer option combinations only. It owns no
  unit, price, SKU, barcode, factor, Stock Behavior, or balance meaning.
- Sellable Offering is the stable commercial choice and is exactly one Product
  Unit Offering or Service Offering.
- Each Product owns immutable Unit Configuration Versions with one Canonical
  Inventory Unit and direct exact Unit Factors.
- Alternate Transaction Units transact against one Shared Stock Pool and own no
  balance. Packaged Stock owns separate physical balances.
- Quantities and factors use exact decimal semantics and cross API/offline
  boundaries as strings. Binary floating point and silent rounding are
  forbidden for inventory truth.
- Stock Operations atomically group immutable Stock Movements against explicit
  Balance Sources. Receipts, reservations, sales, returns, counts, adjustments,
  transfers, transformations, custody, closeout, and corrections use this
  ledger.
- Commercial Order lines select Sellable Offerings and retain immutable
  Offering Snapshots. Product fulfillment and Service work remain separate.
- Business catalog, Store Offering Availability, price history, and Store stock
  are distinct responsibilities.
- Offline commands are versioned, idempotent, provisional until accepted, and
  surface typed conflicts rather than silently reinterpreting stale meaning.
- The implementation uses a destructive development reset. Unit-template and
  ProductVariant/unit compatibility models, feed presets, metadata fallbacks,
  old queue events, and legacy Service identities are deleted without backfill
  or compatibility readers.

## Consequences

- ADR-0010 and the unit/storage implementation portions of ADR-0008 are
  superseded. Their prototype runtime has been removed.
- A sale in quarter units may reduce a canonical Shared Stock Pool without a
  quarter-unit balance.
- Preparing 100 half packages from 50 full packages is an explicit balanced
  Stock Transformation between two actual Packaged Stock balances.
- Variant options such as colour, size, or garment cannot accidentally become
  stock units.
- Services share Catalog/Offering/Order contracts but categorically receive no
  inventory relationships.
- Database, API, dashboard, mobile, storefront, offline storage, reports and
  active Brain documentation now use the replacement. Historical migrations
  remain immutable; Prisma generated and applied the destructive replacement
  migration after the approved local development reset.
