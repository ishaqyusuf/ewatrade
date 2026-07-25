# ADR-0020: Tenant Customer Directory And Order Snapshots

## Status

Accepted

## Context

Customer Book previously reconstructed every customer from contact details on
Commercial Orders. That made customer lookup useful after a sale, but a
merchant could not save a customer before creating the first Order.

## Decision

Add a tenant-scoped `Customer` directory with a required name and optional
phone/email. Normalized phone and email values prevent duplicate contact
identities within a Tenant.

Commercial Orders continue to snapshot customer name, phone, and email. A
directory selection supplies those snapshot values but does not make historical
Orders depend on a mutable Customer row. Customer Book merges saved directory
records with identified Order contacts and pending offline Orders.

Standalone Customer directory writes are online-only. Existing offline Order
creation continues to queue customer snapshot facts; replay creates or reuses
the matching tenant Customer as part of the Order transaction. ADR-0021
narrows this exception to new Order checkout.

## Consequences

- A customer can be created independently and selected on a later Order.
- Existing order-derived customers remain visible without a data backfill.
- A named offline Order may add its customer to the directory without enabling
  standalone offline Customer creation.
- Updating or removing a directory record cannot rewrite historical Order
  customer facts.
- Future customer editing or merge workflows must preserve normalized identity
  uniqueness and immutable Order snapshots.
