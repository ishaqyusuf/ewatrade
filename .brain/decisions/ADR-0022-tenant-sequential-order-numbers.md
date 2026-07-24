# ADR-0022: Tenant-Sequential Commercial Order Numbers

## Status

Accepted

## Context

Commercial Orders used timestamp-and-UUID `EO-*` references. They were safe but
hard for merchants and customers to read, repeat, and search. The GND reference
uses count-derived sales numbers, but count-then-create can race when EwaTrade
accepts concurrent web, mobile, Service, and offline-replay writes.

## Decision

Allocate new human-facing Order numbers from an atomic counter stored on the
Tenant. Increment the counter inside the existing Commercial Order transaction
and format the returned value as `ORD-` plus a minimum of three digits.

Numbering is Tenant-wide, not Store-wide. Existing `EO-*` references are not
rewritten. The API exposes only the final authoritative number and provides no
next-number preview.

## Consequences

- All Stores in one business share one unambiguous sequence.
- Concurrent and offline-replayed Orders cannot receive the same number.
- Concurrent requests with one idempotency identity return the same committed
  Order and roll back the losing counter increment.
- Failed transactions roll the increment back; cancelled Orders retain their
  numbers and numbers are never reused.
- Other document types do not share this counter. A generic document registry
  remains deferred until another confirmed use case requires it.
