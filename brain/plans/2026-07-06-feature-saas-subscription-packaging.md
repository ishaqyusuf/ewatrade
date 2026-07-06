# Plan: SaaS Subscription Packaging

## Type
Feature

## Status
Proposed

## Created Date
2026-07-06

## Last Updated
2026-07-06

## Intake
- Intake File: brain/intake/2026-07-06-sales-management-saas-mvp.md
- Intake Item: Subscription based SaaS product usable by every sales management business.

## Goal Or Problem
Package ewatrade Retail Ops as a subscription SaaS with tenant-level plan access, limits, trial state, and billing status enforcement.

## Current Context
The current Brain direction is multi-tenant SaaS, but there is no explicit subscription/billing schema or plan gating. The product needs a path to paid usage across multiple businesses.

## Proposed Approach
Add tenant subscription records and plan definitions. Gate Retail Ops features by plan limits such as businesses/stores, sales reps, products, offline devices, reports history, and support level. Integrate with a billing provider after provider selection, while keeping the core access model provider-agnostic.

## Implementation Steps
- Define MVP plans and limits: TODO: Free/trial, Starter, Growth, Pro.
- Add schema for subscription, plan, billing customer id, status, renewal date, trial dates, and limits snapshot.
- Add billing/access service that resolves tenant entitlements.
- Gate routes/actions for plan-limited features like sales reps, products, businesses/stores, and report history.
- Build dashboard billing/settings screen for current plan, usage, and upgrade CTA.
- Integrate billing provider checkout/webhook if provider is confirmed.
- Add admin-safe handling for expired, cancelled, trialing, and past-due states.

## Affected Files Or Areas
- `packages/db/prisma/models/base.prisma`
- `apps/dashboard`
- `apps/marketing`
- `packages/utils`
- `brain/product/roadmap.md`
- `brain/api/permissions.md`

## Acceptance Criteria
- Tenant has a subscription/billing status and plan.
- App can resolve feature limits for a tenant.
- Plan limits are enforced for at least reps, products, and businesses/stores or TODO: selected limits.
- Dashboard shows current plan and upgrade/billing state.
- Billing provider-specific fields are isolated behind a service boundary.

## Test Plan
- Run `bun run db:generate`.
- Run `bun run typecheck`.
- Add or run entitlement tests for plan limits and status handling.
- Manually verify blocked/allowed flows for plan limits.

## Brain Update Requirements
- Update `brain/product/roadmap.md`, `brain/api/permissions.md`, `brain/database/schema.md`, and add a billing feature doc.

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

## Linked Task
- Task Title: SaaS Subscription Packaging
- Task File: brain/tasks/roadmap.md
