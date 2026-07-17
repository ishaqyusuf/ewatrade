# ADR-0007: Store Currency And Mobile Minor Units

## Status

Accepted

## Context

Currency was duplicated across UI formatters and several mobile offline money
fields were named as generic prices/totals while sync APIs expected integer
minor units. This allowed a possible 100× discrepancy between offline mobile
records and server commerce records.

## Decision

- `Store.currencyCode` is the commerce source of truth.
- `Tenant.currencyCode` supplies the default for newly created stores.
- New selections are restricted to NGN, USD, GHS, KES, ZAR, and EGP.
- Shared utilities own currency metadata, symbols, legacy code fallback,
  editable formatting, and explicit major/minor conversion.
- Server commerce values remain integer minor units and are not migrated.
- Mobile persisted product, sale, and closeout money uses explicit `*Minor`
  field names. Persist version 1 converts legacy local major-unit fields once.
- Currency change after transaction history, exchange conversion, and
  historical repricing are separate future decisions.

## Consequences

All money surfaces can render the active store currency consistently, offline
sync payloads no longer rely on ambiguous units, and unsupported legacy codes
remain visible without being mislabeled. Feature validations still decide
whether zero or negative values are allowed.
