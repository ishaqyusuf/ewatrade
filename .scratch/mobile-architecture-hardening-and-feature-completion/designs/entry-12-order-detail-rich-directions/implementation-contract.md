# Order detail implementation contract

Approved direction: **Option A — Dispatch Docket**.

## Visual contract

- Extend the marigold docket masthead through the status-bar safe area.
- Keep the compact business/order-docket kicker and dominant order number.
- Lead with a ruled summary containing truthful total, payment/fulfilment state,
  balance due, item count, and line count.
- Keep customer identity, Product and Service lines, totals, delivery/payment/
  fulfilment context, notes, and activity available below the summary.
- Use Market Day semantic tokens in both themes; retain visible selected/status
  labels and centered action content.
- Keep the Record payment action bottom-safe and reachable without obscuring
  the final scroll content.
- At 200% text, reflow the summary, money, line identity, actions, and metadata
  without clipping or shrinking essential copy.

## Behavior contract

- Preserve live `orders.get` resolution and cached-order offline fallback.
- Preserve refresh, back routing, customer navigation, record-payment modal,
  payment validation, payment methods/reference, and mutation invalidation.
- Preserve line-level Product fulfilment and fulfil-all behavior, including
  scheduled-delivery, offline, and concurrent-mutation guards.
- Preserve loading, missing, query-error, offline, notice, balance-paid, mixed
  Product/Service, notes, and activity states.
- Derive every label, count, monetary value, and available action from the real
  Order; do not ship review-board sample values.
- Do not present packaging as the next action for service-only work.

## Verification contract

- Add focused tests for any new presentation model or state mapping.
- Capture native Android Light/Dark, scrolled status-bar, paid/balance-due,
  offline, scheduled-delivery, and 100%/200% text evidence.
- Run focused Order tests, commerce/app-shell/large-text/keyboard/theme/
  NativeWind guards, scoped formatting, Android export, and two independent
  reviews before completion.
