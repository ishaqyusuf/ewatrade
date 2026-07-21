# ADR-0016: Mobile Admin Root Tab Boundary

## Status

Accepted and implemented.

## Context

The owner dashboard previously composed its own five-item dock and hid that
dock on scroll. Navigation mixed root destinations, action entry points, and
progressively revealed labels. More was a small action sheet, so production
settings such as theme preference had no durable root-screen owner.

Admin navigation needs predictable identity across empty, Product-only,
Service-only, and mixed workspaces while preserving fast creation and keeping
secondary operational workflows focused.

## Decision

- Place Home, Orders, `catalog`, and More in one protected Expo Router tab
  group available only to Owner, Admin, and Manager roles.
- Render the shared `MobileBottomTabs` as the group's custom tab bar and insert
  the center `+` as an action rather than a route.
- Keep `catalog` as the route, selection, accessibility, and test identity.
  Derive only its visible label from sticky workspace availability: Products
  for Product-only, Services for Service-only, and Catalog for mixed or empty.
- Keep the floating dock available on all four root tabs. Home, Orders, and
  Catalog hide it on downward scroll and reveal it on upward scroll; More keeps
  it fixed for reference fidelity. Creation and More drill-down workflows
  remain full-screen stack routes outside the tab group and therefore never
  render the dock.
- Let the tab layout own the shared Create chooser so every root opens the same
  Product, Service, Customer, Order, contextual Stock Entry, and Staff actions.
- Make More a real root screen titled Menu. It owns production App theme
  selection through the existing persisted System/Light/Dark preference, plus
  links only to implemented workspace and account capabilities.
- Keep sales-rep navigation unchanged.

## Consequences

- Root tab identity and automated selectors do not change when Product or
  Service history changes.
- Orders and Catalog own their loading, empty, error, offline, search, and
  filtering states without turning those states into navigation changes.
- Root content must reserve safe bottom space for the always-visible dock.
- New root-only capabilities require an explicit tab-boundary decision; normal
  workflows remain outside the group.
- App theme has one production entry point and continues to use device-local
  persistence without API or database changes.
