# 13 - Low-Stock Level Alert Workflow

## Parent map

[Wayfinder: Standard Dashboard System](map.md)

## Type

feature-spec

## Status

ready-for-agent

## Blocked by

04 - Inventory, Inbounds, And Stock Movement Operations

## Question

How should EwaTrade turn existing low-stock and out-of-stock states into a first-class alert workflow for owners and managers?

Resolve threshold ownership, alert creation, alert lifecycle, dashboard and inventory-table placement, mobile summary behavior, notification settings, role permissions, and QA coverage. This should extend the current inventory stock-state behavior without inventing a dashboard-only inventory model.

## Proposed Scope

- Each product unit or variant can use its explicit `reorderPoint`; when no value is set, the product should use the existing safe fallback threshold until a business-specific default is introduced.
- An alert is raised when available stock drops to or below the threshold, using available quantity rather than raw on-hand stock so reserved stock is not over-promised.
- Alert identity should be tenant, store, product, sellable unit or variant, and threshold source. Repeated low-stock reads should update the same open alert rather than creating duplicates.
- Alert lifecycle should support `open`, `acknowledged`, `snoozed`, and `resolved`. Restocking above the threshold should resolve the alert automatically unless a user has manually dismissed it for audit reasons.
- Owners and managers can acknowledge, snooze, or resolve alerts. Attendants can see operational low-stock warnings only where needed for sales or assigned inventory, but should not manage alert settings.
- Dashboard home should show a compact low-stock alert card with count, most urgent items, and a route to the filtered inventory view.
- Inventory tables should expose low-stock filters, threshold/reorder columns, alert state, and quick actions such as restock, adjust threshold, acknowledge, or snooze where permitted.
- Notification settings should reserve channel controls for in-app, email, and WhatsApp/SMS copy/fallback, but first implementation can ship in-app dashboard/mobile alerts before external providers.
- Search-anything should find active low-stock alerts and actions such as "view low stock", "record stock intake", and "adjust reorder point" when permitted.
- Analytics should report low-stock count, out-of-stock count, days open, and repeated stockout patterns without blocking the core alert workflow.

## Acceptance Criteria

- [ ] Low-stock alerts are derived from the same inventory read model used by dashboard and mobile stock summaries.
- [ ] The alert threshold source is visible: explicit reorder point, business/store default, or fallback.
- [ ] Alert rows include product, unit or variant, store, available stock, threshold, last sale or movement where available, state, and age.
- [ ] Dashboard home, inventory table, notifications/settings, and search surfaces all agree on alert counts.
- [ ] Acknowledging or snoozing an alert is permission-gated and auditable.
- [ ] Restocking above threshold resolves the alert or removes it from active alert counts.
- [ ] Empty, loading, offline/unavailable, and no-permission states are defined.
- [ ] Tests cover threshold calculation, duplicate prevention, lifecycle transitions, role permissions, table filters, and dashboard count consistency.

## Out of Scope

- Changing Prisma schema or adding migrations in this Wayfinder artifact.
- Sending live email, WhatsApp, or SMS alerts before provider and notification settings are implemented.
- Supplier purchase automation or automatic reorder purchasing.
- Forecasting demand beyond simple repeated-stockout reporting.
