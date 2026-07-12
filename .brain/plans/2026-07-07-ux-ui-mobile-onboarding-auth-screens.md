# Plan: Mobile Onboarding And Auth Screens

## Type
UX/UI

## Status
In Progress

## Created Date
2026-07-07

## Last Updated
2026-07-11

## Intake
- Intake File: .brain/intake/2026-07-07-mobile-expo-starter.md
- Intake Item: Add splash, onboarding, login, and sign up screens for the mobile starter.

## Goal Or Problem
The mobile starter needs polished first-run and auth-adjacent screens so the app feels like the sales and inventory product direction, even before real API auth is wired.

## Current Context
Brain records the app working name as `mobile` and the direction as a sales and inventory management system for small businesses. The saved Dribbble reference emphasizes modern sales/order dashboards, onboarding, settings/profile, notification patterns, and clear analytics cards. This pass should apply the direction without implementing production auth or backend onboarding.

## Proposed Approach
Build NativeWind-based screens that use local state and route actions from the routing shell. Keep forms realistic and replaceable, but make submit actions local placeholders. Do not add backend API calls in this plan.

## Implementation Steps
- Add a branded splash/startup loading screen aligned with Expo splash configuration.
- Build a 3-step onboarding flow: business setup, inventory/sales workflow, and team/sales reps.
- Persist onboarding completion through the local onboarding store.
- Build a login screen with email/password validation, sign-up navigation, and a local submit action.
- Build a sign-up screen with owner name, business name, email, phone, password, local submit action, and dashboard redirect.
- Use existing UI primitives where they fit; create only small screen-local components when needed.
- Keep copy focused on small-business sales and inventory management.
- Ensure mobile layouts respect safe areas, keyboard behavior, and small-screen text wrapping.

## Affected Files Or Areas
- `apps/mobile/src/app/onboarding.tsx`
- `apps/mobile/src/app/login.tsx`
- `apps/mobile/src/app/sign-up.tsx`
- `apps/mobile/src/components`
- `apps/mobile/src/styles/global.css`
- `apps/mobile/assets`

## Acceptance Criteria
- Splash/loading state appears during app startup and does not hang.
- Onboarding can be completed and routes to sign up.
- Login accepts valid-looking local credentials and routes to dashboard.
- Sign up accepts required starter fields, creates local starter session, marks onboarding complete, and routes to dashboard.
- Screens use Ewatrade/mobile language and no GND copy.
- Layouts do not overlap on typical phone viewport sizes.

## Test Plan
- Run `rg -n "GND|gnd|prodesk|www-mobile" apps/mobile/src apps/mobile/assets apps/mobile/app.config.ts`.
- Run `git diff --check`.
- Manual Expo smoke test for onboarding, login, sign-up, keyboard input, and route transitions.
- Use screenshots or simulator inspection before completion if a visual QA tool is available.

## Brain Update Requirements
- Update progress only unless implementation changes the Retail Ops IA.

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
- Local auth placeholders must be clearly isolated so they are easy to replace with Better Auth later.
- Keyboard and safe-area behavior can break forms on smaller devices if not checked.

## Open Questions
- None.

## Progress Notes
- 2026-07-11: Removed the remaining local-auth sample business fallback. Google/local auth sessions without a submitted business now seed `My Business` instead of `Sample Store`, keeping the auth flow free of sample/demo business language while production auth is still pending.
- 2026-07-11: Added a branded route-level startup loading state. The index route now shows an Ewatrade splash-style loading screen while local onboarding hydration completes, using the same mobile primitives and registered icon system instead of a bare spinner, before routing to onboarding, login, or dashboard.
- 2026-07-11: Replaced the single-screen onboarding placeholder with a compact 3-step onboarding flow for business setup, stock/unit tracking, and team selling. The flow uses existing MobileScreen, ActionButton, Pressable, Text, and registered Icon primitives, includes progress indicators and a skip path, and still completes the local onboarding store before routing to login.
- 2026-07-10: Added the next auth UX slice: shared buttons now route through the app haptic pressable, login and sign-up moved from password/local-placeholder copy to Google/email-code flows, and a reusable OTP input plus `verify-email` route were added for local verification handoff. The screens still use local session behavior until production auth endpoints are implemented.
- 2026-07-10: Seeded local multi-business state from sign-up/login sessions. Local auth now creates or reuses a business workspace from the submitted business name so the dashboard can scope Retail Ops data to the active business.

## Linked Task
- Task Title: Mobile Onboarding And Auth Screens
- Task File: .brain/tasks/roadmap.md
