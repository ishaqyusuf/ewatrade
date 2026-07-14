# 02 - HalalVest-Aligned Auth, Dashboard Shell, And Workspace Switching

**What to build:** a web user can sign up or log in through a HalalVest-aligned dashboard auth flow, land in a Midday-style dashboard shell, and switch between permitted businesses and stores while route visibility respects their role.

**Blocked by:** 01 - Dashboard Reference Audit And Adoption Blueprint.

**Status:** implementation-complete

- [x] Web auth behavior is aligned with the HalalVest reference while preserving EwaTrade tenant, store, session, membership, and role boundaries.
- [x] Authenticated users land in a Midday-style dashboard shell with sidebar, header, profile/sign-out, and workspace controls.
- [x] Business and store switching updates the active context used by dashboard reads and mutations.
- [x] Owner/admin, manager, and attendant roles see only the navigation surfaces they are permitted to use.
- [x] Existing dashboard route-handler bridges are documented as retained, migrated, or removed.
- [x] Browser workflow QA covers sign up or login, shell load, role-aware navigation, business switching, store switching, and sign out.
- [x] Brain API, feature, or architecture docs are updated if auth/session/workspace behavior changes.

## Implementation Notes

- Added `apps/dashboard/src/lib/navigation.ts` and `apps/dashboard/src/lib/navigation.test.ts` for role-aware dashboard navigation and known-route access policy.
- Updated the dashboard shell to use a Midday-style fixed sidebar plus sticky header with search entry, profile/sign-out controls, and tenant/store selectors.
- Updated dashboard middleware to pass `x-pathname` and tenant context through request headers so the shell can gate known routes by role.
- Changed unauthenticated dashboard middleware behavior from marketing signup redirect to marketing login redirect with `next` preserved.
- Retained the current dashboard route-handler bridges for logout, active tenant, active store, and store creation during this migration slice.
- Focused validation passed: `bun test apps/dashboard/src/lib/navigation.test.ts`, `bun --filter @ewatrade/dashboard typecheck`, and targeted `bunx biome check` on touched files.
- Removed the dashboard app root placeholder so `/` resolves through `(shell)/page.tsx` and the authenticated Midday-style shell instead of shadowing it.
- Moved `getUserInitials` into `apps/dashboard/src/lib/user-display.ts` so client shell components no longer import `apps/dashboard/src/lib/session.ts`, which depends on `next/headers`.
- Browser/HTTP workflow QA now covers unauthenticated redirect to marketing login, login session creation, authenticated shell load, role-aware owner navigation in rendered shell HTML, profile/sign-out route behavior, active-store endpoint success/error behavior, active business switching, active store switching, and post-logout redirect behavior.

## QA Evidence

- Started the local marketing/dashboard stack with `bun run dev --local --filter dashboard marketing`, which ran the local PostgreSQL startup, Prisma generation, and migration deployment against the local dev database.
- Seeded local QA account `dashboard.qa.ticket02.71402@example.com` with Better Auth plus two active owner businesses: `dashqa-ticket02-primary` and `dashqa-ticket02-secondary`. The primary business has `Main Store` and `Warehouse Store`; the secondary business has `Secondary Store`.
- `POST http://localhost:3092/api/auth/login` returned `200` and created Better Auth session cookies for the QA owner.
- `GET http://localhost:3094/` with the QA cookies returned `200` and rendered the Midday-style dashboard shell with owner navigation, `Dashboard QA Primary`, `Main Store`, `Dashboard QA Secondary`, and `Warehouse Store` present in the serialized shell context.
- `POST http://localhost:3094/api/stores/active` with `Warehouse Store` returned `200` and set `ewatrade.active_store_id`.
- `POST http://localhost:3094/api/tenants/active` with `dashqa-ticket02-secondary` returned `200` and set `ewatrade.active_tenant_slug`.
- `GET http://localhost:3094/` after tenant switching returned `200` and rendered `Dashboard QA Secondary` with `Secondary Store` as the active workspace context.
- `POST http://localhost:3094/api/auth/logout` returned `200`; a follow-up `GET http://localhost:3094/` with the logged-out cookie jar returned `307` to `http://localhost:3092/login?next=%2F`.
- Restored the authenticated QA jar to `dashqa-ticket02-primary` and `Main Store` through the same active tenant/store endpoints after the workflow checks.
