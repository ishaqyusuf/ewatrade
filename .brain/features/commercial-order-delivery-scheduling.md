# Commercial Order Delivery Scheduling And Reminders

## Status

Implemented in source on 2026-07-25. Database migration generation remains
blocked until a local PostgreSQL/Docker engine is available.

## Checkout

- Every new Commercial Order records a delivery due date/time. Clients default
  it to the current time; the repository also defaults omitted values to now.
- Checkout may include the initial payment and `fulfillNow` intent in the same
  idempotent Order transaction.
- `fulfillNow` commits every Product reservation through the existing stock
  ledger and creates Product Fulfillment facts. Product-only Orders become
  Completed; mixed Product/Service Orders become Fulfilling.
- A future delivery time rejects immediate fulfillment. Manual Product-line
  fulfillment remains unavailable until the due timestamp.
- Order overview retains individual Product-line fulfillment and also exposes
  one `Fulfill all products` action. The bulk command atomically commits every
  remaining active Product reservation and skips lines already fulfilled. Its
  tenant-scoped receipt binds the client identity to the payload and preserves
  the original result for stable retries.
- Existing Orders retain a null delivery time so rollout does not manufacture
  reminders for historical records.

## Stock Visibility

- Product choices show exact available quantity (`on hand - reserved`) in the
  selected Offering unit.
- Shared-pool quantities are converted with the Offering unit factor and
  transaction scale; Packaged Stock remains in its own balance unit.
- The same available-stock description appears in the picker, selected line,
  and checkout review.
- Creating an unfulfilled Order reserves stock, reducing available quantity
  without reducing on-hand quantity. Fulfilling the Order commits the
  reservation and reduces on-hand quantity.

## Reminder Policy

- Each Store may enable or disable all delivery reminders independently and
  toggle day-before and same-day email reminders.
- Missing settings preserve the default: enabled with both reminder timings.
- Only Owners and Admins may view or change reminder settings.
- The hourly Trigger.dev task checks local calendar days in the Tenant
  timezone. It never fulfills Orders.
- Active Owners, Admins, and Managers receive reminder email for Orders that
  still have unfulfilled Product lines.
- Recipient-level delivery records make each Order/timing/email reminder
  idempotent and retain retry status. A short database claim lease prevents
  concurrent dispatch, while the Order/timing/recipient identity is also sent
  as the provider idempotency key.

## Offline Behavior

The existing version-1 offline Order command accepts the optional delivery
timestamp and fulfillment intent. Replay still performs the same server-side
due-time, stock, price, configuration, and authorization checks.

## Related Decisions

- `.brain/decisions/ADR-0013-generic-catalog-inventory-units-and-stock-operations.md`
- `.brain/decisions/ADR-0021-owner-controlled-order-only-offline-operations.md`
- `.brain/decisions/ADR-0024-scheduled-commercial-order-fulfillment-and-management-reminders.md`
