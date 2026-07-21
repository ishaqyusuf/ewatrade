# ADR-0015: Record-Derived Progressive Feature Revealing

## Status

Accepted and implemented.

## Context

New businesses were shown the same operational navigation and zero-value
dashboard sections as established businesses. Hiding empty modules outright
would create circular discovery problems unless first-record creation remained
available. Durable feature flags would add state and migrations even though
the existing operational history already records whether a workspace has used
a capability.

## Decision

- Derive one shared `WorkspaceFeatureAvailability` read model from bounded
  existence queries instead of persisting feature-reveal flags.
- Scope operational presence to the active Store. Scope Staff presence to the
  Tenant because membership is business-wide.
- Treat historical records as sticky presence: archived Catalog items and
  removed, suspended, or invited operational memberships still reveal their
  features.
- Keep live prerequisites separate from historical presence. In particular,
  `hasActiveSellableItems` controls whether a new Order can be started.
- Keep visibility separate from authorization. Navigation combines presence
  with the existing role policy on dashboard/web surfaces. Mobile bottom-tab
  membership remains stable for the active role, while record presence
  controls dashboard content, filters, metrics, and contextual actions.
  Server-side tenant, role, subscription, and Product/Service rules continue to
  enforce access and writes.
- Preserve explicit first-record paths through the dashboard launchpad,
  command search, URL-owned creation sheets, mobile Add action, and authorized
  creation deep links.
- Merge pending mobile offline projections with the authoritative contract
  until replay completes, then invalidate and refetch the authoritative state.

## Consequences

- No schema migration or feature-flag backfill is required.
- A feature does not disappear after its last current record is archived or a
  Staff member is removed.
- Store switching cannot leak Sales, Inventory, Service Job, Customer, or
  Report presence across stores; Staff remains intentionally shared.
- Shell reads add a small set of parallel indexed existence queries rather than
  full counts or record loads.
- Removing a navigation entry never grants or revokes authorization, and
  authorized first-record creation remains discoverable.
- Mobile role-authorized bottom tabs remain predictable before and after the
  first record; their destination screens own zero-data and first-record
  experiences.
