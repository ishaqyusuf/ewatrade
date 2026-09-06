# Orders list implementation contract

Approved direction: **Option A — Dispatch Ledger**.

## Visual contract

- Extend the marigold masthead through the status-bar safe area.
- Keep the compact order-desk kicker, large Orders title, and customer-book
  action from the approved direction.
- Use the Market Day canvas, ink, palm, paprika, sky, line, and field tokens in
  both Light and Dark modes; do not fall back to a generic black-and-white UI.
- Present loaded operational totals in a ruled three-column ledger, followed by
  date and status controls and numbered order rows.
- Preserve the floating five-position business dock and its central Create
  action.
- Switch the status-bar background from marigold to the content canvas only
  after the masthead scrolls away, and restore marigold at the top.
- At 200% system text, stack or wrap summary content without clipping controls,
  order identity, money, or status text.

## Behavior contract

- Keep the existing paginated `orders.listPage` query, date/status filters,
  conditional search, refresh, next-page loading, and order-detail navigation.
- Keep customer-book access and catalog-aware Create routing.
- Preserve loading, query-error, offline, pending-sync, first-order,
  filtered-empty, and populated states.
- Derive all summary counts, monetary values, payment context, status labels,
  and item counts from loaded order data. Never copy sample values from the
  design board into production.
- Exclude device-provisional orders from loaded totals and display them with an
  explicit pending-sync treatment.
- Describe the active date range truthfully; do not label the default 30-day
  query as “Today”.
- Retain network limitations and reconciliation language in offline states.

## Verification contract

- Cover presentation logic and development-only QA routing with focused tests.
- Capture Android Light and Dark screenshots for populated, first-order, and
  pending/offline coverage, plus a 200% text screenshot.
- Run the mobile navigation, app-shell, large-text, theme-token, NativeWind,
  and focused Orders test guards.
- Complete standards and spec-compliance reviews before marking this package
  implemented.
