# Backlog

## Purpose
Pending work that is identified but not actively being executed.

## Items

### Mobile paginated query direction contract

- Priority: High
- Description: Align the mobile infinite-query `direction` field with the
  strict `catalog.listItemsPage` and `orders.listPage` input schemas. Android
  emulator QA on 2026-07-23 confirmed that Catalog/Products, Orders, and
  Customers render `unrecognized_keys` errors because the generated infinite
  query input includes `direction: "forward"`.
- Related Feature: Mobile list pagination and search density
- Status: Backlog

No unstarted Generic Inventory or Generic Service implementation ticket
remains. The clean local database cutover is complete. Behavioral QA is tracked
in `.brain/tasks/in-progress.md` for the separate testing goal. Managed
cross-device/public evidence is a deployment integration, not a prerequisite
for the implemented private local capture flow.
