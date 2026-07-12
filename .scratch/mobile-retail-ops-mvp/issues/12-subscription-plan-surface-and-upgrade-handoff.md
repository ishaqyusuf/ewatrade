# 12 — Subscription Plan Surface And Upgrade Handoff

**What to build:** mobile users with the right role can see the current business subscription state, the three MVP tiers, usage against limits, and a provider-neutral upgrade handoff. The UI should stay provider-agnostic and keep local plan state only as an offline fallback.

**Blocked by:** 03 — Mobile Dashboard Production Snapshot.

**Status:** implementation-complete

- [x] Mobile subscription surface reads production subscription state when online.
- [x] The surface shows Starter, Growth, and Pro tiers from backend-owned plan definitions when available.
- [x] Current plan, status, usage, and limits are visible for the active business.
- [x] Upgrade requests call the provider-neutral checkout intent API for non-current tiers.
- [x] Provider-pending or unavailable checkout responses are shown clearly without exposing provider-specific implementation details.
- [x] Offline or production-unavailable state falls back to local subscription information without claiming a completed production upgrade.

## Notes

- The dashboard already hides subscription management from attendant dashboards while production APIs enforce tenant-management roles.
- `SubscriptionPlanSheet` reads `retailOps.subscription` online, falls back to local subscription data when offline or unavailable, renders backend-owned plan definitions when present, and shows usage against product, staff, business, offline-device, and report-history limits.
- Non-current tier taps now call `retailOps.createSubscriptionCheckoutIntent` only when production subscription data is available; local fallback mode is read-only and explicitly says upgrade requests need production billing.
- The checkout API now uses an explicit billing-management guard for `retailOps.createSubscriptionCheckoutIntent`, while subscription reads keep separate view permission copy. The mobile handoff now opens a returned provider-neutral `checkoutUrl` with React Native `Linking` after checking the device can open it, and keeps provider-not-configured responses as an in-app notice.
- Pure subscription plan and fallback helpers now live in `apps/mobile/src/lib/retail-ops-subscription.ts` instead of the native-backed store file, with `subscriptionStore.ts` re-exporting them for existing screen imports. `apps/mobile/src/lib/retail-ops-subscription.test.ts` covers the three MVP tiers, limit progression, deterministic local trial fallback, local-business fallback, and usage-limit labels/states.
- Added focused DB query coverage for production subscription and offline-device entitlement behavior. `packages/db/src/queries/retail-ops-subscriptions.test.ts` proves subscription snapshots merge durable tenant subscription state with backend-owned plan definitions, usage counts, offline-device usage, and entitlement limit state; provider-neutral checkout intent creation writes a provider-none durable checkout session for non-current tiers; and offline-device registration trims device inputs, checks entitlement availability, and upserts an active durable device with platform/store/user scope.
- API architecture QA now covers the focused Subscription router split. Subscription snapshot reads and provider-neutral checkout intent creation live in `apps/api/src/trpc/routers/retail-ops-subscriptions.ts` and are merged into the existing `retailOps.*` namespace, while the core router keeps subscription error handling where it still supports report-history and offline-device entitlement checks. `bun run --cwd apps/mobile qa:subscription-flow`, `bun run --cwd apps/mobile qa:retail-ops-api-boundary`, `bun --filter @ewatrade/api typecheck`, `bun --cwd apps/mobile tsc --noEmit --pretty false`, `bun run --cwd apps/mobile qa:mvp-source`, and `bun run --cwd apps/mobile qa:mvp-contracts` passed.
