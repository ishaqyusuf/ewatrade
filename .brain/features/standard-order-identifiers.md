# Standard Order Identifiers

## Status

Implemented

## Goal

Give every new Commercial Order a short, predictable customer-facing
reference such as `ORD-001` without weakening multi-device safety or changing
historical references.

## Behavior

- Numbering is Tenant-wide across every Store in the business.
- Existing `EO-*` Order numbers remain unchanged.
- New Orders start at `ORD-001`, use at least three numeric digits, and continue
  naturally beyond 999.
- The server allocates the number during authoritative Order creation. Clients
  cannot preview or reserve the next value.
- Direct sales, Service Intake, Quote acceptance, and offline replay share the
  same Commercial Order creation path.

## Reliability

`Tenant.lastCommercialOrderSequence` is incremented atomically in the same
transaction that creates the Commercial Order and its downstream facts.
Concurrent creation receives distinct values, while a rolled-back transaction
does not consume a number. Concurrent idempotent retries reload and return the
first committed Order when their payloads agree. Cancelled Orders keep their
issued references.

## Validation

- Unit coverage verifies prefix, padding, and four-digit growth.
- PostgreSQL integration coverage verifies cross-Store sequencing, concurrent
  allocation, concurrent idempotent recovery, rollback, legacy references, and
  Tenant-level uniqueness.
- The Tenant/order-number unique constraint remains the final database guard.
