# Mobile Global Search And Commerce Attribution

## Problem

Sales operators need to find operational records without navigating several
feature areas. They also need a reliable answer to who took an Order and who
received a payment, plus shortcuts that carry known Customer or Catalog context
into order creation.

## Delivered Experience

- Home shows the account avatar beside the greeting. Pressing it opens More.
  The Home action area contains notifications and search; More does not repeat
  the account avatar.
- Global Search opens as a protected full-screen mobile route with an
  automatically focused, safe-area bottom input. Two or more characters return
  grouped Orders, Customers, Catalog Items, Service Jobs, and permitted Staff.
- Each result kind has a distinct icon/color treatment and a type-specific
  destination. The empty query exposes quick actions for Order, Product,
  Service, Customer, and received-payment workflows.
- Customer overview offers Create order for customer and carries the immutable
  customer id/contact snapshot into checkout.
- Catalog item overview offers Create order and carries the Catalog Item id
  into checkout. Checkout loads that item directly and preselects its first
  currently sellable Offering once.
- Order overview shows the resolved account that took the Order. Its activity
  feed attributes every received payment to the recording account.
- More contains Payments received, a cursor-loaded searchable directory showing
  payment amount/method/time, Order, Customer, and receiver.

## Search Contract

- Server input: normalized query length 2–160, per-entity limit 1–10.
- Result discriminants: `order`, `customer`, `catalog_item`, `service_job`,
  `staff`.
- Scope: active Tenant only. Staff results require management capability;
  operational sales roles still search commerce and service entities.
- Customer aggregation includes the saved Customer directory and historical
  Order customer snapshots. Catalog aggregation covers Product and Service
  item kinds.
- Results are ranked by exact/prefix/contains relevance and then bounded per
  entity. The client applies a short debounce but does not perform its own
  authoritative cross-entity search.

## Attribution Contract

- `CommercialOrder.createdByUserId` and
  `CommercialOrderPayment.recordedByUserId` remain the immutable audit facts.
- Read repositories batch-resolve those ids against tenant Membership history
  and return bounded actor summaries (`id`, `name`, `email`, `role`).
- An unresolved membership does not remove the stored id; UI falls back to a
  neutral account label.
- Received payments includes only payment facts, not refunds.

## Implementation Boundaries

- No database schema or migration was required; the actor id columns already
  existed.
- Search and payment reads live in tenant-scoped DB query modules and are
  exposed through protected tRPC procedures.
- Quick actions are navigation conveniences. Final mutations retain their
  existing authorization, stock, pricing, payment, and idempotency validation.
- Offline global search is not authoritative. The screen explains that a
  connection is required rather than presenting incomplete local results as
  global.

## Verification

- Schema normalization, navigation visibility, catalog preselection, activity
  ordering, and actor attribution have focused tests.
- API and mobile TypeScript checks pass.
- Targeted Biome and mobile NativeWind, keyboard, commerce, and app-shell
  guards pass.
- Android dark-mode QA covered Home header placement, keyboard-open Global
  Search, More without duplicate avatar, and Payments received empty/error
  states.
