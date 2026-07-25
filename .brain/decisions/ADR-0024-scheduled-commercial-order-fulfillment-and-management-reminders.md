# ADR-0024: Scheduled Commercial Order Fulfillment And Management Reminders

## Status

Accepted on 2026-07-25.

## Context

Commercial Order creation reserves Product stock, while a later fulfillment
commits that reservation and reduces on-hand stock. Checkout needs an explicit
way to perform both actions immediately, or schedule delivery and remind the
management team without prematurely changing fulfillment state.

## Decision

- Reservation and fulfillment remain separate stock-ledger events.
- New Orders snapshot a delivery due timestamp; existing Orders keep a null
  value during rollout.
- `fulfillNow` is command intent, not persisted policy. When selected for a due
  Order, Order creation, initial payment, reservations, stock commitment, and
  Product Fulfillment facts share one transaction.
- Future delivery rejects immediate or manual fulfillment until the exact due
  timestamp. No scheduled job auto-fulfills an Order.
- Reminder settings belong to each Store. Missing rows mean reminders,
  day-before delivery, and same-day delivery are enabled.
- Owners and Admins configure settings. Active Owners, Admins, and Managers are
  email recipients.
- An hourly Trigger.dev task classifies delivery by Tenant-local calendar day
  and sends through the notifications/email package boundary.
- Reminder delivery is idempotent per Order, timing, and normalized recipient
  email, with durable Pending, Sent, and Failed state, a claim lease, and a
  matching provider idempotency key.

## Consequences

- Available stock falls at reservation time; on-hand stock falls only at
  fulfillment time.
- Checkout can complete the common walk-in sale atomically without hiding the
  ledger distinction.
- Scheduled delivery cannot cause an early stock commitment, and reminders do
  not silently mutate Order state.
- Retryable delivery records prevent hourly task runs from repeatedly emailing
  the same recipient.
- Store-scoped settings support multi-Store businesses without a global policy
  compromise.
