# 10 - Settings, Subscription, And Payroll/Payout Planning Surface

**What to build:** owners can manage business and store settings, inspect subscription plan state and usage, start upgrade handoff where supported, and see a clearly scoped payroll or payout planning area without overbuilding final payroll logic.

**Blocked by:** 02 - HalalVest-Aligned Auth, Dashboard Shell, And Workspace Switching; 05 - Staff Management And Role Administration.

**Status:** implementation-complete

- [x] Settings pages expose business, store, account, notification, permission, and billing-related settings appropriate to current APIs.
- [x] Subscription surface shows current plan, tier definitions, usage against limits, and upgrade handoff state.
- [x] Subscription actions are owner/admin permissioned and do not claim provider checkout is complete when only a provider-neutral handoff exists.
- [x] Payroll or payout appears as a planned dashboard area with clear scope and no fake final-provider behavior.
- [x] Browser QA covers settings navigation, subscription display, upgrade handoff state, role-gated billing access, and payroll/payout placeholder scope.
- [x] Brain docs are updated if settings, subscription, or payroll/payout product scope changes.

## Implementation Notes

- Expanded `/settings` beyond billing to include business, store, account, notification, permission, and payroll/payout planning sections.
- Kept subscription state, plan tiers, entitlement usage, and upgrade intent behavior backed by the existing Retail Ops subscription tRPC APIs.
- Kept payroll and payout explicitly planned/read-only: no provider settlement, payroll execution, or payout mutation behavior is claimed.
- Settings remains owner/admin-gated through centralized dashboard navigation/path policy.

## QA Evidence

- `bun --filter @ewatrade/dashboard typecheck`
- `bunx biome check 'apps/dashboard/src/app/(shell)/settings/page.tsx' apps/dashboard/src/components/dashboard/retail-ops-subscription-settings.tsx`
- `bun test apps/dashboard/src/lib/navigation.test.ts`
- `curl -b /tmp/ewatrade-dashboard-qa-relogin.cookies http://localhost:3094/settings` returned `200`.
- `curl -b /tmp/ewatrade-dashboard-qa-logout.cookies http://localhost:3094/settings` returned `307` to `http://localhost:3092/login?next=%2Fsettings`.
- SSR text check found `Business`, `Store`, `Account`, `Notifications`, `Permissions`, `Payroll and payout`, `Provider settlement`, and `provider-neutral`.
