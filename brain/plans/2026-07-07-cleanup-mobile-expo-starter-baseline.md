# Plan: Mobile Expo Starter Baseline Cleanup

## Type
Cleanup

## Status
Done

## Created Date
2026-07-07

## Last Updated
2026-07-07

## Intake
- Intake File: brain/intake/2026-07-07-mobile-expo-starter.md
- Intake Item: Remove stale copied GND/generated files and establish the `mobile` Expo app identity.

## Goal Or Problem
`apps/mobile` was copied from a GND Expo app and still contains generated artifacts, native projects, stale GND app identifiers, old docs/assets, and references to deleted routes/helpers. The starter needs to be clean before adding Ewatrade screens.

## Current Context
Brain identifies `apps/mobile` as the Expo mobile app for merchant and/or courier flows. The current copied app has NativeWind present, but also stale `android`, `ios`, `dist`, `.expo`, `.turbo`, GND `app.config.ts` identity, old update configuration, and broken references such as deleted static router/trpc helpers and old GND role surfaces.

## Proposed Approach
Remove generated/native/copy artifacts, rewrite Expo identity for `mobile`, keep only the reusable NativeWind/UI foundation, and verify no stale GND references remain. Do not implement product screens in this cleanup plan.

## Implementation Steps
- Delete copied/generated folders and files that should not be part of the managed starter: `apps/mobile/android`, `apps/mobile/ios`, `apps/mobile/dist`, `apps/mobile/.expo`, `apps/mobile/.turbo`, and `.DS_Store` files.
- Rewrite `apps/mobile/app.config.ts` with app name `mobile`, slug `mobile`, schemes `ewatrade-mobile` and `ewatrade-mobile-dev`, bundle IDs `com.ewatrade.mobile` and `com.ewatrade.mobile.dev`, and no copied GND EAS owner/project/update URLs.
- Remove or replace GND-specific docs/assets, including `apps/mobile/DESIGN.md` content and stale icon/splash asset names where needed.
- Remove copied app surfaces and helpers that reference deleted GND modules, including update modal/screens, static router/trpc helpers, jobs/dispatch/installer route assumptions, and old unavailable/access screens if no longer used.
- Keep NativeWind infrastructure: `nativewind-env.d.ts`, `tailwind.config.ts`, `metro.config.js`, `src/styles/global.css`, and root global CSS import.
- Prune obviously unused copied dependencies after deleted code is removed, especially Supabase, update/dev-client-only packages, duplicate toast packages, and unused heavy native modules.
- Update Brain repo docs if implementation materially finalizes `apps/mobile` as an active app surface.

## Affected Files Or Areas
- `apps/mobile`
- `apps/mobile/app.config.ts`
- `apps/mobile/package.json`
- `apps/mobile/assets`
- `brain/engineering/repo-structure.md`
- `brain/PROJECT_INDEX.md`

## Acceptance Criteria
- No stale `GND`, `gnd`, `prodesk`, copied EAS owner, or copied project ID remains in `apps/mobile`.
- `apps/mobile` no longer contains generated/native folders that should be regenerated later.
- NativeWind configuration remains present and referenced.
- The mobile package has no dependencies that are only needed by removed copied features.
- No imports reference deleted copied helper files.

## Test Plan
- Run `rg -n "@gnd|GND|gnd|prodesk|pcruz|www-mobile|static-router|static-trpc|app-auto-update-modal" apps/mobile`.
- Run `bun install --lockfile-only --offline`.
- Run `git diff --check`.
- Run a targeted mobile typecheck if dependency cleanup resolves locally.

## Brain Update Requirements
- Update `brain/engineering/repo-structure.md` and `brain/PROJECT_INDEX.md` if `apps/mobile` becomes an active scaffold rather than planned future work.
- Update progress only if no domain docs change.

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
- Removing native folders is correct for the managed starter but will require regenerating native projects before custom dev-client work.
- Pruning dependencies too aggressively can break retained UI primitives; verify imports after each dependency removal.

## Open Questions
- None.

## Linked Task
- Task Title: Mobile Expo Starter Baseline Cleanup
- Task File: brain/tasks/roadmap.md
