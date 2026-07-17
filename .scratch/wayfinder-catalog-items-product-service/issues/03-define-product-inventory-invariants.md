## Parent map

[Wayfinder: Product And Service Catalog Items](../map.md)

## Type

grilling

## Status

open

## Blocked by

[Lock the neutral store and sellable-item domain](01-lock-neutral-store-and-sellable-item-domain.md)

## Question

How should inventory, reservations, staff stock wallets, stock intake, unit conversion, sales deductions, returns, closeout, and offline replay enforce that only `PRODUCT` items participate in stock?

Resolve server-side validation placement, database constraints where practical, failure semantics, product creation defaults, and safeguards that prevent a service item from acquiring inventory through direct API calls or legacy replay events.
