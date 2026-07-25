# ADR-0023: Optional Management Approval For Staff Offline Orders

## Status

Accepted on 2026-07-25.

## Context

Offline checkout already persists a durable, idempotent Commercial Order
command and either applies it or records a conflict during replay. Some
businesses want staff-created offline records to reach the server without
changing authoritative Orders, payments, Customers, or stock until management
reviews them.

## Decision

- `Tenant.metadata.offlineApprovalRequired` is an independent admin setting.
  Absence means approval is off.
- When approval is on, offline Orders replayed by Cashier or Operator roles are
  persisted with the existing `REVIEW_REQUIRED` command state, a null conflict
  code, and an awaiting-approval message.
- Owner, Admin, and Manager roles bypass staging for their own offline Orders.
- Approval and rejection are exposed through the existing offline review
  procedure. Approval applies the original staff-authored command inside one
  database transaction; rejection discards it.
- The server enriches the stored command payload with the authenticated staff
  actor id. Clients cannot supply or override this value.
- A failed approval rolls back its Order transaction, then becomes an ordinary
  typed conflict with authoritative state in a separate transaction.
- Replay never applies an already-staged record merely because the approval
  setting later changes; only explicit approval may apply it.
- The existing conflict-review storage and enums are reused; this decision
  requires no Prisma schema migration.

## Consequences

- Reconnect can always upload device work immediately without granting it
  authority immediately.
- The original staff member remains the Order/payment actor after management
  approval.
- Management has one Offline review queue for staged records and conflicts,
  with distinct actions and copy for each.
- Turning approval on does not broaden the offline command boundary: only new
  Commercial Orders with optional checkout payment and customer facts remain
  supported.
