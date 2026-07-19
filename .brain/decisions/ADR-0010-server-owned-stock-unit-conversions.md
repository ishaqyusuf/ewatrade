# ADR-0010: Server-Owned Stock Unit Conversions

## Status

Superseded by
[ADR-0013](./ADR-0013-generic-catalog-inventory-units-and-stock-operations.md).
This record describes the implemented prototype only. Per-unit ProductVariant
balances, feed presets, whole-only conversion output, ratio fallbacks, and
paired conversion movements are rejected by the clean replacement.

Implemented on 2026-07-18.

## Context

Retail Ops stores each sellable stock unit as its own `ProductVariant` inventory
bucket. A feed merchant may receive sealed bags, then deliberately open some of
those bags into half bags, quarter bags, or loose kilograms. Those operations
must move stock between buckets without creating or destroying physical
quantity.

The previous clients supplied both source and target quantities. A missing
conversion ratio could pass validation, the mobile calculation used the ratio
in the wrong direction, and mixed-unit inventory totals could be presented as
if bags and kilograms were directly additive.

## Decision

- A product keeps one inventory bucket per sellable unit.
- Every convertible unit must have a positive ratio to the product's base unit.
  Durable numerator/denominator fields are authoritative; legacy metadata is a
  rollout fallback.
- The client submits the source unit, target unit, and whole source quantity.
  The server derives the only valid whole target quantity.
- Missing ratios, cross-product conversions, same-unit conversions, fractional
  target outputs, ratio mismatches from older clients, and insufficient
  unreserved stock fail before mutation.
- A successful conversion atomically decrements the source bucket, increments
  the target bucket, and writes paired conversion-out/conversion-in movements.
- Online and offline callers use an external id so retries are idempotent.
- Inventory summaries may show each unit bucket and a base-unit equivalent, but
  must not sum raw mixed-unit counts into one quantity.
- Standard feed presets are provided for 25 kg and 50 kg bags with Bag,
  Half bag, Quarter bag, and Kilogram ratios.

## Consequences

- Converting 50 bags into half bags yields 100 half bags while total
  base-equivalent quantity remains 50 bags.
- A 25 kg bag converts to 25 kilogram units; a 50 kg bag converts to 50.
- Clients show calculated output as read-only preview and reconcile with the
  authoritative server response.
- Existing callers may temporarily send `targetQuantity`; the server accepts it
  only when it equals the derived quantity.
- Fractional physical stock remains represented through smaller whole sellable
  units rather than decimal inventory counts.
