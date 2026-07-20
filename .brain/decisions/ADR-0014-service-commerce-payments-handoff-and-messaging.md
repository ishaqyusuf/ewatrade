# ADR-0014: Service Commerce Payments, Handoff And Messaging

## Status

Accepted and implemented.

## Context

Generic Service Operations could record Intake, work progress and promises, but
did not complete the operational loop for deposits, final collection, express
charges, customer reminders, batch updates or actual SMS/WhatsApp delivery.
Marking a line completed also made it possible to skip payment and customer
handoff.

## Decision

- Keep garment, service and size pricing in concrete Catalog Offerings.
- Store express and reminder policy in Store-scoped Service settings and
  snapshot applied express charges during Intake.
- Record payments/refunds as idempotent Commerce ledger facts and retain only
  derived paid/balance projections on the Order.
- Keep `READY_FOR_HANDOFF` distinct from completion. Only the explicit handoff
  command completes ready lines and the Order, after the balance is settled.
- Treat batch progress/delay as manager commands with per-Job revision guards.
- Treat notification scheduling and delivery as Communications concerns.
  Provider-neutral SMS/WhatsApp webhooks are configured by environment, while
  every attempt remains auditable.

## Consequences

- Small businesses may leave work unassigned; larger teams may assign during
  Intake or later.
- Pay-ahead, deposit and pay-on-collection share one payment model.
- Promise changes replace pending reminders. Obsolete reminders are cancelled
  only when the full Job is ready or handed off, not when one line becomes
  ready.
- Notification scheduling remains retryable across enqueue or provider
  failures. Workers atomically claim dispatchable intents, while the scheduler
  can recover unlocked pending or ready intents without duplicate delivery.
- Production delivery requires the relevant webhook URL/token and a deployed
  recurring jobs worker. Missing provider configuration fails as a recorded
  delivery attempt rather than changing Service or payment truth.
