# 02 - Configure Business Capability Profile

**What to build:** Give each Store a server-owned Service Commerce capability and readiness profile for requests, quotes, bookings, payments, pickup, delivery and allowed channels.

**Blocked by:** 01 - Define Service Commerce Boundary And Compatibility Contract.

**Status:** ready for implementation

**Approval:** Original and revised Progressive Catalog scope owner-approved on
2026-08-09.

- [ ] Define shared Zod contracts for capability configuration, readiness blockers, operational access and customer-visible availability.
- [ ] Keep Tenant/Store/role/exception authorization at API and repository boundaries; clients render the returned access state.
- [ ] Support per-Store activation while retaining Tenant-level administration and billing ownership.
- [ ] Add a server-owned Catalog adoption mode of `progressive` or
  `inventory_managed`, with separate readiness for private draft capture,
  public activation, tracked stock and procure-to-order policy.
- [ ] Make incomplete setup, restricted vertical policy, unavailable provider and disabled capability distinct states with actionable recovery.
- [ ] Add a Midday-style setup surface with server prefetch/hydration, URL-owned safe scope, focused forms, exact invalidation and explicit loading/error/empty states.
- [ ] Audit every activation/configuration change with actor, Store, previous/current value and reason.
- [ ] Test owners/admins/operators, ordinary staff, personal exceptional access where applicable, disabled Stores and cross-Tenant/Store attempts.
- [ ] Update Brain feature, API permission/contract and database docs for any approved schema/API changes.
