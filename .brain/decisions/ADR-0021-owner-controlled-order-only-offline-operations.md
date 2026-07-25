# ADR-0021: Owner-Controlled Order-Only Offline Operations

## Status

Accepted and implemented.

## Context

The mobile queue previously accepted Catalog setup, inventory, closeout,
Service work, evidence, assignment, and Order commands. This made it possible
for staff to perform broad operational work without the owner choosing whether
the business accepts offline activity.

The required offline scope is deliberately smaller: staff may create a
Commercial Order, record its checkout payment, and capture a new Customer as
part of that Order. Product, Service, inventory, closeout, Staff, and Service
work mutations require a connection.

## Decision

- Persist the business-wide owner policy as
  `Tenant.metadata.offlineOperationsEnabled`. A missing key preserves the
  existing enabled behavior. Update that one JSON key atomically so unrelated
  Tenant metadata cannot be overwritten by concurrent writes.
- Only the `OWNER` role may update the policy. Authenticated commercial/POS
  roles may read it.
- Device registration and replay fail closed when the owner policy is
  disabled.
- The supported offline payload union contains only `commercial_order`.
  Optional `initialPayment` and immutable customer snapshot facts travel
  inside that command.
- Order replay atomically records an optional checkout payment and projects a
  named customer into the tenant Customer directory while the Order retains
  its immutable customer snapshot.
- The mobile queue discards pre-policy persisted command shapes at its clean
  schema-version boundary. Catalog, inventory, closeout, Staff, and Service
  screens present an online-required state instead of queueing work.
- The mobile Sync & offline screen is the owner control surface and caches the
  last confirmed policy per business before offline mode can be entered.
- The authenticated mobile shell refreshes the policy every 30 seconds while
  foregrounded and resets the active offline mode when the user switches
  businesses.

## Consequences

- Old clients cannot bypass the narrowed scope because the strict API schema
  rejects every non-Order offline command.
- Turning the policy off prevents new device registration and replay until the
  owner enables it again.
- An already disconnected device cannot learn about a remote policy change
  until it reconnects; the server remains authoritative when it does.
- The setting uses the existing Tenant metadata column, so this decision
  requires no Prisma migration.
- Standalone Customer creation and later payment/work mutations remain
  online-only. Customer creation and payment are offline-capable only as part
  of a newly queued Order checkout.
