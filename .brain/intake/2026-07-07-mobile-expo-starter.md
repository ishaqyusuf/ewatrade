# Brain Intake: Mobile Expo Starter

## Status
Partially Complete

## Created Date
2026-07-07

## Last Updated
2026-07-07

## Raw Input
Turn the copied GND Expo app in `apps/mobile` into a clean Ewatrade `mobile` starter. The implementation should remove stale copied/generated files, keep NativeWind, rewrite app identity, use local onboarding/session state for now, and add splash, onboarding, login, sign up, and dashboard screens. The first pass should not wire production Better Auth mobile endpoints or regenerate native iOS/Android folders.

## Generated Plans
- [x] Mobile Expo Starter Baseline Cleanup - `.brain/plans/2026-07-07-cleanup-mobile-expo-starter-baseline.md` - Status: Done
- [x] Mobile API And tRPC Env Scaffold - `.brain/plans/2026-07-07-feature-mobile-api-trpc-env-scaffold.md` - Status: Done
- [x] Mobile Local Session And Routing Shell - `.brain/plans/2026-07-07-refactor-mobile-local-session-routing-shell.md` - Status: Done
- [ ] Mobile Onboarding And Auth Screens - `.brain/plans/2026-07-07-ux-ui-mobile-onboarding-auth-screens.md` - Status: In Progress
- [ ] Mobile Starter Dashboard - `.brain/plans/2026-07-07-ux-ui-mobile-starter-dashboard.md` - Status: Proposed

## Recommended Execution Order
1. Mobile Expo Starter Baseline Cleanup - removes stale copied code and generated artifacts before new screens are built.
2. Mobile API And tRPC Env Scaffold - fixes package/env boundaries so the app has the right future API seam without requiring backend auth work.
3. Mobile Local Session And Routing Shell - creates the root app flow that the screens will attach to.
4. Mobile Onboarding And Auth Screens - builds the first-run and auth UI on top of the local shell.
5. Mobile Starter Dashboard - adds the first owner/manager sales and inventory home after navigation and local session state exist.

## Agent Recommendations
- Mobile Expo Starter Baseline Cleanup: open-code - filesystem/package/config cleanup with observable import and branding checks.
- Mobile API And tRPC Env Scaffold: open-code - typed API/env wiring is code-oriented and should stay tightly scoped.
- Mobile Local Session And Routing Shell: open-code - routing and state refactor is a focused Expo implementation task.
- Mobile Onboarding And Auth Screens: antigravity - screen composition benefits from visual iteration against the saved Dribbble direction.
- Mobile Starter Dashboard: antigravity - dashboard density, card hierarchy, and mobile polish benefit from design-focused iteration.

## Merged Items
- Splash setup, app branding, GND artifact removal, and native folder removal were grouped into the baseline cleanup because they all define the app starter identity.
- Login, sign up, and onboarding were kept together because they share the same local session/onboarding flow and route guards.

## Duplicate Or Existing Items
- The broader sales and inventory product roadmap already exists in `.brain/intake/2026-07-06-sales-management-saas-mvp.md`; this intake only covers the tactical Expo mobile starter.
- The visual direction overlaps with `.brain/plans/2026-07-06-ux-ui-retail-ops-design-system-and-ia.md`; this intake applies that direction to the first mobile screens rather than replacing the design-system plan.

## Needs Clarification
- None for this starter pass.

## Skipped Items
- Production Better Auth mobile API wiring - skipped because this pass uses local session placeholders and the copied GND `www-mobile-*` endpoints do not exist in Ewatrade.
- Native iOS/Android project regeneration - skipped because the app should remain Expo managed until EAS identity is finalized.
- Real sales/inventory backend data - skipped because the dashboard is a local starter shell until Retail Ops API procedures exist.

## Approval Notes
- None.

## Handoff Notes
- Use `brain-batch-handoff` to convert approved plans into handoffs and queue items.
