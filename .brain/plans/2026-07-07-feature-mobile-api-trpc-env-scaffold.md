# Plan: Mobile API And tRPC Env Scaffold

## Type
Feature

## Status
Done

## Created Date
2026-07-07

## Last Updated
2026-07-07

## Intake
- Intake File: .brain/intake/2026-07-07-mobile-expo-starter.md
- Intake Item: Keep a future API/tRPC seam while using local auth/session placeholders for the starter.

## Goal Or Problem
The copied mobile tRPC client imports Ewatrade API types and `superjson`, but `apps/mobile/package.json` is missing the right workspace/API dependencies and still uses stale base URL naming. The starter should have a clean API seam without pretending production mobile auth is done.

## Current Context
Ewatrade uses Hono and tRPC with `apps/api/src/trpc/routers/_app.ts`. Dashboard and marketing import `@ewatrade/api` and use aligned `@trpc/*` versions plus `superjson`. The mobile app currently imports `@api/trpc/routers/_app`, has a `@api/*` tsconfig path, and points auth code at copied `www-mobile-*` endpoints that do not exist in this repo.

## Proposed Approach
Align mobile package dependencies and aliases with Ewatrade, define clear Expo public API env names, and remove copied mobile auth endpoint calls. The tRPC client should be ready for future authenticated procedures but should not call unavailable mobile auth routes in this pass.

## Implementation Steps
- Add `@ewatrade/api` and `superjson` to `apps/mobile/package.json`.
- Align `@trpc/client` and `@trpc/tanstack-react-query` versions with the web apps.
- Replace the `@api/*` import style with `@ewatrade/api/trpc/routers/_app` for `AppRouter` typing, unless a repo-wide convention requires retaining the path alias.
- Update `apps/mobile/src/lib/base-url.ts` to prefer `EXPO_PUBLIC_API_URL` for API calls and `EXPO_PUBLIC_WEB_URL` only for web-surface links.
- Update `.env.example` to document `EXPO_PUBLIC_API_URL`, `EXPO_PUBLIC_WEB_URL`, `EXPO_PUBLIC_APP_VARIANT`, and `EWATRADE_EXPO_PORT`.
- Remove copied `www-mobile-sign-in`, `www-mobile-session`, and `www-mobile-sign-out` usage from the starter flow.
- Keep tRPC headers minimal: include `x-trpc-source: mobile`; leave auth token headers as a future extension.

## Affected Files Or Areas
- `apps/mobile/package.json`
- `apps/mobile/tsconfig.json`
- `apps/mobile/src/trpc/client.tsx`
- `apps/mobile/src/trpc/query-client.ts`
- `apps/mobile/src/lib/base-url.ts`
- `apps/mobile/.env.example`

## Acceptance Criteria
- Mobile tRPC imports use Ewatrade workspace API types.
- Mobile package dependencies include all direct imports used by the tRPC client.
- No mobile starter code references copied `www-mobile-*` auth endpoints.
- Local development and production API base URLs are documented in `.env.example`.
- The API seam remains present without requiring real mobile auth in this pass.

## Test Plan
- Run `rg -n "www-mobile|@api/trpc|EXPO_PUBLIC_BASE_URL|EXPO_PUBLIC_API_URL|@ewatrade/api|superjson" apps/mobile`.
- Run `bun install --lockfile-only --offline`.
- Run `git diff --check`.
- Run targeted typecheck for `apps/mobile` if local dependency resolution allows it.

## Brain Update Requirements
- Update progress only.

## Lower-Agent Readiness
- Implementation scope is clear: Yes
- File boundaries are clear: Yes
- Acceptance criteria are observable: Yes
- Required checks are listed: Yes
- Brain update requirements are listed: Yes
- Ready for handoff: Yes

## Completion Report Requirements
Lower agent must report:
- Changed files
- Checks run
- Brain docs updated
- Unresolved issues
- Any skipped acceptance criteria

## Risks / Edge Cases
- Expo public env variables must be prefixed with `EXPO_PUBLIC_` to be available in the client.
- Keeping auth headers without real token semantics can mislead future implementers; document token use as future work if retained.

## Open Questions
- None.

## Progress Notes
- 2026-07-10: The API now exposes the first Retail Ops read procedures on the mounted `retailOps` tRPC router. Mobile can target `retailOps.summary`, `retailOps.inventory`, and `retailOps.salesByProduct` once authenticated mobile sessions are connected to the production API.

## Linked Task
- Task Title: Mobile API And tRPC Env Scaffold
- Task File: .brain/tasks/roadmap.md
