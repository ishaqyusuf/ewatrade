# Plan: SaaS Subscription Packaging

## Type
Feature

## Status
In Progress

## Created Date
2026-07-06

## Last Updated
2026-07-11

## Intake
- Intake File: .brain/intake/2026-07-06-sales-management-saas-mvp.md
- Intake Item: Subscription based SaaS product usable by every sales management business.

## Goal Or Problem
Package ewatrade Retail Ops as a subscription SaaS with tenant-level plan access, limits, trial state, and billing status enforcement.

## Current Context
The current Brain direction is multi-tenant SaaS. The product needs a path to paid usage across multiple businesses, with durable subscription schema, plan gating, and provider integration moving from first-phase bridges into production-backed records.

The mobile MVP now has a local subscription packaging bridge. Starter, Growth, and Pro plan definitions live in the mobile subscription store, each active business resolves a default Starter trial locally, the mobile dashboard shows current plan and usage, the Subscription sheet shows all three tiers, and local guards block product creation, staff invites, and business creation when the active plan limit is reached. The production dashboard now has a `/settings` billing and plan screen backed by `retailOps.subscription`, showing current plan, status, usage, limits, and available tiers. Upgrade actions now call a provider-neutral checkout intent through `retailOps.createSubscriptionCheckoutIntent`, which preserves the handoff contract while returning `checkoutUrl: null` until provider integration is selected. The Prisma source schema, generated client, and live repository now include durable subscription plan, tenant subscription, and checkout-session rows with metadata/default fallback. Provider checkout, webhooks, App Store/Play Store billing, and full server-side entitlement coverage still need follow-up slices.

## Proposed Approach
Add tenant subscription records and plan definitions. Gate Retail Ops features by plan limits such as businesses/stores, sales reps, products, offline devices, reports history, and support level. Integrate with a billing provider after provider selection, while keeping the core access model provider-agnostic.

## Implementation Steps
- Define MVP plans and limits: TODO: Free/trial, Starter, Growth, Pro.
- Add schema for subscription, plan, billing customer id, status, renewal date, trial dates, and limits snapshot.
- Add billing/access service that resolves tenant entitlements.
- Gate routes/actions for plan-limited features like sales reps, products, businesses/stores, and report history.
- Build dashboard billing/settings screen for current plan, usage, and upgrade CTA.
- Add a provider-neutral checkout-intent contract before binding the UI to a billing provider.
- Integrate billing provider checkout/webhook if provider is confirmed.
- Add admin-safe handling for expired, cancelled, trialing, and past-due states.

## Affected Files Or Areas
- `packages/db/prisma/models/base.prisma`
- `apps/dashboard`
- `apps/marketing`
- `packages/utils`
- `.brain/product/roadmap.md`
- `.brain/api/permissions.md`

## Acceptance Criteria
- Tenant has a subscription/billing status and plan.
- App can resolve feature limits for a tenant.
- Plan limits are enforced for at least reps, products, and businesses/stores or TODO: selected limits.
- Dashboard shows current plan, upgrade/billing state, and a provider-neutral checkout handoff result.
- Billing provider-specific fields are isolated behind a service boundary.

## Test Plan
- Run `bun run db:generate`.
- Run `bun run typecheck`.
- Add or run entitlement tests for plan limits and status handling.
- Manually verify blocked/allowed flows for plan limits.

## Brain Update Requirements
- Update `.brain/product/roadmap.md`, `.brain/api/permissions.md`, `.brain/database/schema.md`, and add a billing feature doc.

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
- Billing provider choice affects webhook, checkout, and local testing complexity.
- Hard enforcement can disrupt existing merchants if limits are not communicated clearly.
- Multi-business accounts require clear tenant-level versus account-level billing decisions.

## Open Questions
- TODO: Confirm billing provider and MVP pricing/limit tiers.
- TODO: Confirm whether subscription is per business/tenant or per owner account.

## Progress Notes
- 2026-07-10: Added the first mobile local subscription packaging slice. The app now has Starter, Growth, and Pro plan definitions, a persisted business-scoped subscription store, dashboard plan/usage visibility, a keyboard-safe plan sheet, and local limit guards for products, staff invites, and business creation.
- 2026-07-10: Added the first production subscription snapshot bridge. `retailOps.subscription` returns backend-owned Starter, Growth, and Pro plan definitions, resolves tenant metadata subscription state or a default Starter trial fallback, reports current usage counts, and exposes entitlement counters for owner/admin review. Durable subscription repository wiring, billing provider integration, app-store purchases, and server-side write enforcement remain pending.
- 2026-07-10: Added first-phase production entitlement enforcement for product creation and staff invites. `retailOps.createProduct` now checks the current product limit before writing, and `retailOps.inviteStaff` checks the staff limit before creating or restoring a counted staff membership. Durable subscription repository wiring, billing provider integration, business/store limits, offline device limits, report-history limits, and app-store purchases remain pending.
- 2026-07-10: Added first-phase production report-history entitlement enforcement. Protected Retail Ops date-range reads now check the current `reportsHistoryDays` limit before returning history outside the active plan window. Durable subscription repository wiring, billing provider integration, business/store limits, offline device limits, and app-store purchases remain pending.
- 2026-07-10: Added first-phase offline device management for entitlement slots. Managers can list metadata-backed offline device registrations and revoke a device to free a current `offlineDevices` usage slot before dedicated device tables and billing-provider subscriptions are added.
- 2026-07-10: Added first-phase revoked-device enforcement. Revoked offline devices now remain blocked by metadata tombstone even after their active registration is removed, so a revoked device cannot immediately consume another offline-device entitlement slot by re-registering.
- 2026-07-10: Added first-phase revoked-device restore. Managers can list revoked offline-device tombstones and remove one so the device can pass through the normal registration and offline-device entitlement check again.
- 2026-07-10: Added first mobile offline-device management visibility. The sync sheet can show manager-only active/revoked device lists and offers revoke/restore actions, giving tenants a basic way to manage offline-device entitlement slots before dedicated billing/device settings exist.
- 2026-07-10: Added first-phase production business/store entitlement enforcement. `tenant.createStore` and the dashboard `POST /api/stores` route now require owner/admin permission and check the current business/store limit before creating a store. Durable subscription repository wiring, billing provider integration, offline device limits, and app-store purchases remain pending.
- 2026-07-10: Added first-phase production offline-device entitlement enforcement. `retailOps.registerOfflineDevice` records or refreshes a metadata-backed offline device by `deviceId`, counts registered devices in `retailOps.subscription`, and blocks new devices at the current plan limit. Durable subscription repository wiring, dedicated offline-device table, billing provider integration, and app-store purchases remain pending.
- 2026-07-10: Added first mobile offline-device registration wiring. The mobile sync sheet now calls `retailOps.registerOfflineDevice` before replaying supported sync events, so offline-device entitlement is checked before production sync accepts the device envelope.
- 2026-07-11: Added the first dashboard billing/settings screen. `/settings` now reads `retailOps.subscription`, shows the active plan, status, trial/period dates, server-resolved usage and limits, and backend-owned Starter/Growth/Pro tier cards; upgrade handoff was added in the follow-up checkout-intent slice.
- 2026-07-11: Added a provider-neutral checkout intent. `/settings` now calls `retailOps.createSubscriptionCheckoutIntent` for upgrade requests and receives a typed intent with `provider: "none"`, `checkoutUrl: null`, current/target plan context, and a provider-pending message until the first billing provider is selected.
- 2026-07-11: Added the durable subscription source-schema and migration foundation. `packages/db/prisma/models/billing.prisma` declares `SubscriptionPlan` and `TenantSubscription`; `packages/db/prisma/models/enums.prisma` declares `BillingProvider` and `BillingSubscriptionStatus`; and `packages/db/prisma/migrations/20260711123000_retail_ops_subscription_foundation/migration.sql` creates the matching enums, tables, indexes, and foreign keys. Generated Prisma client models and durable subscription reads now exist; applying migrations, seeding production plan rows, and live DB validation remain pending.
- 2026-07-11: Added the durable billing checkout/provider boundary Prisma source schema and migration foundation. `BillingCheckoutSession`, `BillingInvoice`, and `BillingProviderEvent` now model provider-neutral checkout requests, invoice status and amounts, and idempotent provider event payload processing without exposing provider-specific fields to UI code. Durable checkout intent persistence, normalized provider event processing, and invoice upserts now exist; provider selection, payment collection, app-store purchases, provider-native webhook adapters, and live DB validation remain pending.
- 2026-07-11: Added the durable subscription repository bridge. `retailOps.subscription` now reads active durable `SubscriptionPlan` rows and tenant `TenantSubscription` rows when the billing migration is available, applies subscription limits snapshots to entitlement checks, and falls back to metadata/default trial state when durable tables are undeployed. `retailOps.createSubscriptionCheckoutIntent` now persists non-current plan requests to `BillingCheckoutSession` rows with provider `NONE` while preserving the provider-neutral `checkoutUrl: null` response. Provider selection, payment collection, app-store purchases, webhooks, invoice creation, and live migration validation remain pending.
- 2026-07-11: Added the first normalized billing provider event bridge. `POST /api/billing/provider-events` accepts internal-key protected normalized checkout, subscription, and invoice events, stores idempotent `BillingProviderEvent` rows, skips already-processed events, updates matching checkout sessions, upserts tenant subscriptions, and upserts invoices when durable billing tables are available. Provider-native checkout creation, signature verification, payment collection, App Store/Play Store validation, and live migration validation remain pending.

## Linked Task
- Task Title: SaaS Subscription Packaging
- Task File: .brain/tasks/roadmap.md
