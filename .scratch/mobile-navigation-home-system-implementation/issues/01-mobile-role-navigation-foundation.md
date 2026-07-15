# 01 — Mobile Role Navigation Foundation

**What to build:** Admin and sales-rep mobile surfaces are separated through protected navigation boundaries while preserving the shared mobile component system and existing Retail Ops behavior.

**Blocked by:** None — can start immediately.

**Status:** implementation-complete; runtime visual QA pending

- [x] Expo Router uses protected role boundaries for admin and sales-rep surfaces.
- [x] Public auth/onboarding/design-system routes remain reachable according to existing app rules.
- [x] Admin-only routes are not reachable from sales-rep navigation.
- [x] Sales-rep routes have a clear fallback when an admin-only destination is attempted.
- [x] Shared shell primitives remain shared rather than duplicated per role.
- [x] The floating theme FAB is visible only in development/UI-testing mode.
- [x] Source QA verifies the protected route boundaries and dev-only theme FAB behavior through `qa:navigation-home-system`.
