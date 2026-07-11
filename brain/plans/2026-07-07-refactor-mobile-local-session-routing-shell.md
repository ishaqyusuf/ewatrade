# Plan: Mobile Local Session And Routing Shell

## Type
Refactor

## Status
Done

## Created Date
2026-07-07

## Last Updated
2026-07-07

## Intake
- Intake File: brain/intake/2026-07-07-mobile-expo-starter.md
- Intake Item: Replace copied GND protected route logic with a simple local Expo Router shell.

## Goal Or Problem
The copied root layout still assumes GND sections, role guards, deleted route groups, and copied helper components. The mobile starter needs a small, reliable navigation shell for local onboarding, login, sign up, and dashboard flow.

## Current Context
`apps/mobile/src/app` currently contains only a few route files after manual deletes, but `_layout.tsx` still references old protected route groups and missing components. The desired starter flow is local-only: no onboarding complete routes to onboarding, no local session routes to login, and local session routes to dashboard.

## Proposed Approach
Rebuild the Expo Router tree and root providers around a minimal local app state. Keep theme, splash/font loading, NativeWind, tRPC provider, safe area/gesture/keyboard providers as needed, but remove GND role and section concepts.

## Implementation Steps
- Replace `_layout.tsx` with a minimal root stack that loads fonts, controls `expo-splash-screen`, applies navigation theme, and registers onboarding/auth/dashboard routes.
- Add or update route files for `/`, `/onboarding`, `/login`, `/sign-up`, `/dashboard`, and `+not-found`.
- Implement a small local onboarding store backed by AsyncStorage.
- Implement a small local session store with sign-in, sign-up, and sign-out placeholder actions.
- Make `/` perform startup routing based on onboarding completion and local session state.
- Remove old GND `use-auth` role derivation, section guards, and unavailable/access routes from the active app path.
- Keep file names and route names aligned with Expo Router typed routes.

## Affected Files Or Areas
- `apps/mobile/src/app`
- `apps/mobile/src/hooks`
- `apps/mobile/src/lib/session-store.ts`
- `apps/mobile/src/store` or `apps/mobile/src/stores`
- `apps/mobile/src/components`

## Acceptance Criteria
- App startup has exactly one clear route decision path.
- Route tree supports `/onboarding`, `/login`, `/sign-up`, and `/dashboard`.
- Local session and onboarding state can be created, read, and cleared.
- No active route guard references old GND sections, jobs, dispatch, installers, HRM, documents, or notifications.
- Root layout imports only files that exist.

## Test Plan
- Run `rg -n "\\(drivers\\)|\\(sales\\)|\\(job\\)|installer|dispatch|hrm|documents|notifications|StaticRouter|StaticTrpc|AppAutoUpdateModal" apps/mobile/src`.
- Run `git diff --check`.
- Run targeted typecheck for `apps/mobile` if dependencies resolve.
- Manual Expo smoke test: first launch routes to onboarding, completed onboarding routes to login, local login/sign-up routes to dashboard, sign out returns to login.

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
- Expo splash must always hide after startup state is resolved, including error paths.
- Async local state should be treated as starter-only and not confused with production auth.

## Open Questions
- None.

## Linked Task
- Task Title: Mobile Local Session And Routing Shell
- Task File: brain/tasks/roadmap.md
