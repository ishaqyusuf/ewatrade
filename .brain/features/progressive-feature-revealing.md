# Progressive Feature Revealing

## Purpose

Keep each business workspace focused by revealing operational features only
after the active store has relevant history, while retaining explicit
first-record creation paths.

## Status

Implemented on 2026-07-20 across the dashboard, shared API read model, and
mobile app.

## Availability Contract

`tenant.featureAvailability` returns one typed
`WorkspaceFeatureAvailability` read model. It is record-derived and read-only;
role, tenant, subscription, and semantic permissions remain authoritative.

| Feature | Scope | Reveal condition |
| --- | --- | --- |
| Catalog | Active store | Any Product or Service ever associated with the store |
| Product filters and actions | Active store | Any Product ever associated with the store |
| Service filters and actions | Active store | Any Service ever associated with the store |
| Inventory | Active store | Product history exists for the store |
| Sales | Active store | At least one Commercial Order exists |
| Service Jobs | Active store | At least one Service Job exists |
| Customers | Active store | An Order contains a customer name, phone, or email |
| Staff | Business | A non-owner operational membership or invitation exists |
| Reports | Active store | An Order, Service Job, or Stock Operation exists |
| Overview and Settings | Role-authorized workspace | Always visible |

The read model uses bounded existence queries and includes archived Catalog
items and removed, suspended, or invited Staff. Historical use therefore keeps
a feature revealed. `hasActiveSellableItems` remains a separate live
prerequisite for starting an Order.

## Dashboard Behavior

- A new store shows Overview, Settings, and a `Set up your business` launchpad.
- The launchpad exposes Add Product, Add Service, Create first order, and Invite
  staff according to role and live prerequisites.
- Catalog and Staff creation deep links remain accessible to authorized users
  even while their navigation entries are hidden. Sales creation is accessible
  once an active fixed-price Offering is available.
- First-record commands remain in command search independently of visible
  navigation.
- Overview omits order and revenue metrics without Orders, stock metrics
  without Products, and Recent Orders without Order history.
- Each Catalog type filter appears after history for that Product or Service
  kind exists. Both Add paths remain available.
- Catalog creation, Order creation, Service Intake, and Staff invitation
  invalidate availability and refresh the server shell.

## Mobile Behavior

- Role-authorized bottom tabs remain stable regardless of record history:
  owners/admins/managers see Home, Orders, a non-route Add action, the stable
  catalog route, and More; attendants keep Home, New Order, and Work.
- Record history changes only the catalog tab's visible label: Product-only is
  `Products`, Service-only is `Services`, and mixed or empty is `Catalog`.
  Route identity, accessibility, selection, and test IDs remain `catalog`.
- Progressive revealing applies to dashboard content, metrics, quick actions,
  filters, setup guidance, and capability rows inside More rather than
  bottom-tab membership.
- The owner Add action remains available as the permanent first-record entry
  point.
- A new owner sees a progressive setup launchpad for the first item, first
  Order, and optional Staff invitation.
- Empty metric groups, Recent Orders, and unrelated quick actions are omitted.
- Pending offline Product setup, Orders, customer-bearing Orders, inventory
  work, and Service operations are merged with authoritative availability so
  the interface reveals provisional work immediately.
- Online mutations and replay completion invalidate availability. Business
  switching clears the mobile query cache so one business cannot inherit
  another business's feature context.

## Acceptance Coverage

- Empty, Product-only, Service-only, first Order, identified Customer, first
  Service Job, Staff history, store isolation, and business-wide Staff scope
  are covered by focused availability tests. Query-shape assertions verify that
  historical Catalog and Staff reads do not filter out archived, removed,
  suspended, or invited records.
- Dashboard role/navigation, hidden-navigation versus creation access,
  launchpad derivation, and command discovery are covered by pure helper tests.
- Mobile authoritative/provisional merging, progressive dashboard content,
  stable role-aware bottom tabs, and selected-business session replacement are
  covered by focused tests and mobile source QA guards.
- No database migration is required; the sticky behavior derives from existing
  historical records.

## Related Decisions

- `.brain/decisions/ADR-0015-record-derived-progressive-feature-revealing.md`
- `.brain/features/dashboard-standard-system.md`
- `.brain/features/mobile-retail-ops-mvp-spec.md`
- `.brain/features/product-service-catalog-items.md`
