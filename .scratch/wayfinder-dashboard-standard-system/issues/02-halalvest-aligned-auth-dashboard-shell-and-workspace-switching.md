# 02 - HalalVest-Aligned Auth, Dashboard Shell, And Workspace Switching

**What to build:** a web user can sign up or log in through a HalalVest-aligned dashboard auth flow, land in a Midday-style dashboard shell, and switch between permitted businesses and stores while route visibility respects their role.

**Blocked by:** 01 - Dashboard Reference Audit And Adoption Blueprint.

**Status:** implementation-in-progress

- [x] Web auth behavior is aligned with the HalalVest reference while preserving EwaTrade tenant, store, session, membership, and role boundaries.
- [x] Authenticated users land in a Midday-style dashboard shell with sidebar, header, profile/sign-out, and workspace controls.
- [x] Business and store switching updates the active context used by dashboard reads and mutations.
- [x] Owner/admin, manager, and attendant roles see only the navigation surfaces they are permitted to use.
- [x] Existing dashboard route-handler bridges are documented as retained, migrated, or removed.
- [ ] Browser workflow QA covers sign up or login, shell load, role-aware navigation, business switching, store switching, and sign out.
- [x] Brain API, feature, or architecture docs are updated if auth/session/workspace behavior changes.

## Implementation Notes

- Added `apps/dashboard/src/lib/navigation.ts` and `apps/dashboard/src/lib/navigation.test.ts` for role-aware dashboard navigation and known-route access policy.
- Updated the dashboard shell to use a Midday-style fixed sidebar plus sticky header with search entry, profile/sign-out controls, and tenant/store selectors.
- Updated dashboard middleware to pass `x-pathname` and tenant context through request headers so the shell can gate known routes by role.
- Changed unauthenticated dashboard middleware behavior from marketing signup redirect to marketing login redirect with `next` preserved.
- Retained the current dashboard route-handler bridges for logout, active tenant, active store, and store creation during this migration slice.
- Focused validation passed: `bun test apps/dashboard/src/lib/navigation.test.ts`, `bun --filter @ewatrade/dashboard typecheck`, and targeted `bunx biome check` on touched files.
- Browser workflow QA is still pending because the local dashboard/marketing stack was not started in this slice.
