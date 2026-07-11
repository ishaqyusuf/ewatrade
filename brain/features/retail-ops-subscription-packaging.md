# Retail Ops Subscription Packaging

## Purpose

Define the subscription packaging model for ewatrade Retail Ops so businesses can move from trial usage into paid tiers without coupling the product model to one billing provider too early.

## MVP Position

Subscription is business/tenant-scoped for the first Retail Ops MVP. Owners see the current plan in the mobile app and dashboard, understand the limits that affect daily operations, and can request upgrade handoff without coupling UI code to a billing provider. Dashboard and mobile upgrade actions now use a provider-neutral checkout-intent API so the UI can request an upgrade without leaking Stripe, app-store, or manual-billing details into product code.

The mobile app now reads production subscription snapshots when online and keeps the local entitlement bridge as an offline or production-unavailable fallback. It is not final billing, payment collection, webhook handling, invoice management, or App Store/Play Store purchase integration.

## Plan Tiers

### Starter

For one shop starting with simple sales and stock tracking.

- Businesses: 1
- Products: 25
- Staff/attendants: 2
- Offline devices: 1
- Reports history: 30 days
- Support: standard

### Growth

For growing teams that need more attendants and operational history.

- Businesses: 3
- Products: 150
- Staff/attendants: 10
- Offline devices: 5
- Reports history: 180 days
- Support: priority

### Pro

For multi-branch businesses with heavier operations.

- Businesses: 10
- Products: 500
- Staff/attendants: 50
- Offline devices: 20
- Reports history: 730 days
- Support: dedicated

## Local Mobile Bridge

The mobile MVP currently includes:

- plan definitions in `apps/mobile/src/store/subscriptionStore.ts`
- default Starter trial subscription per active business
- business-scoped subscription records in local persisted storage
- dashboard Subscription card with current plan, status, and usage
- Subscription sheet showing Starter, Growth, and Pro tiers
- local limit guards for products, staff invites, and business creation

## Production API Phase 1

The API now exposes `retailOps.subscription` as the first production plan and entitlement snapshot.

Current behavior:

- returns backend-owned Starter, Growth, and Pro plan definitions
- reads active durable `SubscriptionPlan` rows when the billing migration is available, while keeping backend plan constants as fallback definitions
- resolves durable `TenantSubscription` rows when present, including status, trial dates, current period dates, and limits snapshot
- resolves a tenant metadata-backed subscription when present
- falls back to a default Starter trial when no production subscription exists
- returns current usage counts for stores/businesses, products, and staff
- returns entitlement counters for businesses, products, staff, offline devices, and report history
- restricts the read to owner/admin users
- blocks owner/admin store creation when the tenant is at the current business/store limit
- blocks product creation when the tenant is at the current product limit
- blocks new or restored staff invites when the tenant is at the current staff limit
- blocks new offline device registration when the tenant is at the current offline-device limit
- blocks protected date-range report reads when the supplied `from` date exceeds the current report-history limit
- creates a provider-neutral checkout intent through `retailOps.createSubscriptionCheckoutIntent` for owner/admin upgrade requests
- writes a durable `BillingCheckoutSession` row for non-current plan upgrade requests when the billing migration is available, with fallback to the in-memory provider-pending intent for undeployed environments
- returns `provider: "none"` and `checkoutUrl: null` until the billing provider flow is selected

The Prisma source schema, migration folder, generated client, and repository layer now include durable `SubscriptionPlan`, `TenantSubscription`, `BillingCheckoutSession`, `BillingInvoice`, and `BillingProviderEvent` models. The live API uses durable plan/subscription rows, checkout sessions, and normalized provider events first when those tables are deployed, with metadata/default fallback for undeployed environments. This phase processes internal normalized billing provider events, but it does not yet create provider-native checkout sessions, verify provider-native signatures, collect payment, validate App Store/Play Store purchases, or expose provider-specific fields to app clients.

## Dashboard Settings Phase 1

The dashboard app now exposes a Settings screen at `/settings` for owner/admin billing review.

Current behavior:

- reads `retailOps.subscription` through the dashboard tRPC client
- shows the active plan, tenant, billing status, trial end, period end, and source
- labels durable tenant subscription rows as a billing record
- shows server-resolved usage and limits for businesses, products, staff, offline devices, and report history
- shows Starter, Growth, and Pro plan cards from the backend snapshot
- lets owner/admin users request an upgrade intent from each non-current plan card
- shows the provider-pending checkout intent message returned by the API

This surface does not mutate subscription metadata, create a payable checkout session, or manage payment methods.

## Mobile Subscription Sheet Phase 1

The mobile Subscription sheet now consumes the production billing bridge when online.

Current behavior:

- reads `retailOps.subscription` through the mobile tRPC client when online
- shows Online, Refreshing, Local, or Local fallback billing source state
- uses backend-owned plan definitions, current subscription status, and server usage when the production read succeeds
- keeps local plan state available while offline or when the production read is unavailable
- requests non-current plan upgrades through `retailOps.createSubscriptionCheckoutIntent` with surface `mobile`
- shows the provider-pending checkout intent message returned by the API

This surface does not mutate production subscription metadata, create a payable checkout session, or manage payment methods.

## Checkout Intent Phase 1

`retailOps.createSubscriptionCheckoutIntent` is the first provider boundary for subscription upgrades.

Current behavior:

- requires owner/admin access
- accepts a target plan id and caller surface
- resolves the current tenant subscription snapshot before responding
- returns current plan, target plan, tenant, subscription, and intent metadata
- returns `active_plan` when the requested plan is already current
- returns `provider_not_configured` for upgrade requests until billing is wired
- persists non-current plan requests to `BillingCheckoutSession` when the durable billing tables are available
- keeps `checkoutUrl` null and provider set to `none`

Future provider work should attach payable provider sessions behind this contract instead of changing dashboard/mobile UI code to depend on provider-specific fields.

## Billing Provider Event Bridge Phase 1

`POST /api/billing/provider-events` is the first normalized webhook bridge for subscription billing.

Current behavior:

- requires `x-internal-key` matching `INTERNAL_API_KEY`
- accepts provider `manual`, `stripe`, `app_store`, `play_store`, or `other`
- stores durable `BillingProviderEvent` rows by provider and event id for idempotency
- skips already-processed provider events instead of reapplying plan, checkout, or invoice changes
- updates matching `BillingCheckoutSession` rows for normalized checkout status events
- upserts `TenantSubscription` rows for normalized subscription status and checkout-completed events
- upserts `BillingInvoice` rows for normalized invoice events
- returns an unavailable bridge response when durable billing tables are not deployed

Provider-native signature verification, checkout-session creation, app-store receipt validation, payment collection, and renewal reconciliation should be added as provider adapters that submit this normalized event shape.

## Production Model Requirements

Production subscription records should live in the Prisma-owned schema and resolve through service/repository boundaries.

Required production fields:

- tenant/business id
- plan id
- status: trialing, active, past_due, cancelled
- current period start/end
- trial start/end
- billing customer id
- billing subscription id
- provider name
- limits snapshot
- cancellation metadata
- audit timestamps

Current schema foundation:

- `SubscriptionPlan` stores plan key, name, description, price label, currency, optional monthly/yearly prices, support label, active state, sort order, metadata, and entitlement limits JSON.
- `TenantSubscription` stores one active tenant subscription row with plan relation, billing status, provider, billing customer/subscription ids, trial dates, current period dates, cancellation state, limits snapshot, and metadata.
- `BillingProvider` covers none, manual, Stripe, App Store, Play Store, and other provider paths without forcing UI/provider coupling.
- `BillingSubscriptionStatus` covers trialing, active, past due, and cancelled.

## Entitlement Rules

The API must resolve the active tenant entitlement before allowing plan-limited mutations.

Initial gated features:

- business/store creation
- product creation
- staff/attendant invitation
- offline device registration
- report history range for protected report reads

The UI may hide or disable actions, but API/service enforcement remains required.

## Billing Provider Boundary

Billing provider details must stay behind a service boundary.

- Mobile and dashboard call ewatrade APIs for plan state and checkout handoff.
- Webhooks update subscription records idempotently.
- Store billing, card billing, and manual billing should not leak provider-specific fields into UI code.
- App Store and Play Store purchase integration can be added later through the same entitlement model.

## Open Questions

- Confirm final pricing for each tier.
- Confirm whether subscription should remain per business/tenant or move to owner-account billing for multi-business owners.
- Confirm the first billing provider and whether mobile in-app purchase is required for launch.
