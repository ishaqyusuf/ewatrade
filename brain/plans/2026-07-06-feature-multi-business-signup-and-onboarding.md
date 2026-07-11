# Plan: Multi-Business Signup And Onboarding

## Type
Feature

## Status
In Progress

## Created Date
2026-07-06

## Last Updated
2026-07-11

## Intake
- Intake File: brain/intake/2026-07-06-sales-management-saas-mvp.md
- Intake Item: Signup, onboarding, important business info, account can register multiple businesses.

## Goal Or Problem
Allow one user account to create and manage multiple merchant businesses, then guide each business through a Retail Ops onboarding path that captures business type, currency, product category, sales method, and starting setup choices.

## Current Context
The existing schema has `Tenant`, `User`, `Membership`, `Store`, and `OnboardingSession`. The marketing app already includes signup steps for account type, business details, owner details, workspace/subdomain, and success routing. Brain currently notes strong multi-store and multi-tenant support. The mobile MVP now has a local multi-business bridge that seeds a business from signup/login, lets the owner add or switch businesses, and scopes local Retail Ops records by active business id. The dashboard now supports first-phase tenant and store switching: `getActiveTenant` exposes active tenant memberships, host/header slugs remain authoritative, a local/dev active-tenant cookie can choose the tenant when the host does not, and an active-store cookie chooses a store inside the tenant. First-store setup now captures compact Retail Ops onboarding fields and persists them through the shared store creation helper into store metadata and a completed onboarding session.

## Proposed Approach
Extend the signup/onboarding flow so a user can create an initial tenant/business and later add another business from the dashboard. Capture Retail Ops-specific onboarding fields in structured data while preserving the existing tenant/store model. Add first-run setup branching for product/unit templates and POS/dashboard surfaces.

## Implementation Steps
- Review existing signup schemas, signup page flow, and tenant creation route behavior.
- Define business onboarding fields: business name, type/industry, currency, country, sales method, team size, starting product category, and desired modules.
- Ensure the tenant/membership model supports one user owning multiple active merchant tenants.
- Add dashboard entry point for creating/switching businesses if not already present.
- Persist onboarding data in appropriate tenant/store metadata or new schema fields if required.
- Route completed Retail Ops onboarding to the dashboard setup checklist.
- Add validation and copy that supports generic businesses while allowing rabbit feed as a starter example/template.

## Affected Files Or Areas
- `apps/marketing/src/app/signup`
- `apps/marketing/src/components/signup`
- `apps/marketing/src/lib/signup-schemas.ts`
- `apps/dashboard`
- `packages/db/prisma/models/base.prisma`
- `packages/db/prisma/models/commerce.prisma`
- `brain/architecture/multi-tenant.md`

## Acceptance Criteria
- A user can complete signup and create a merchant business/tenant.
- A user can create or access multiple businesses from the same account.
- Onboarding captures Retail Ops setup fields without hard-coding rabbit feed as the product identity.
- The completed onboarding state routes to the correct dashboard or setup checklist.
- Tenant isolation remains explicit in all created records.

## Test Plan
- Run `bun run typecheck`.
- Run targeted signup/onboarding tests if available.
- Manually create two businesses under one account in local dev and verify tenant switching/ownership.

## Brain Update Requirements
- Update `brain/architecture/multi-tenant.md`, `brain/database/schema.md`, and a feature doc for Retail Ops onboarding.

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
- Tenant switching can leak context if dashboard queries do not require tenant scoping.
- Existing signup assumptions may treat one account as one tenant.
- Business setup metadata may become hard to query if overused instead of normalized fields.

## Open Questions
- TODO: Confirm whether businesses and stores should be separate concepts in the first Retail Ops UX or presented as one "business" concept.

## Progress Notes
- 2026-07-10: Added phase-1 local mobile multi-business support. Local sign-up/sign-in now seeds an active business workspace, the dashboard exposes a business switch/create sheet, and local Retail Ops products, sales, customers, staff, share links, stock movements, closeouts, and sync events carry a business id and are filtered by the active business. Production tenant creation, membership APIs, server tenant isolation, dashboard tenant switching, and onboarding persistence remain pending.
- 2026-07-10: Added first-phase production store creation protection. `tenant.createStore` and dashboard `POST /api/stores` now require owner/admin tenant-management permission, create stores through the shared DB helper, and enforce the current business/store subscription entitlement before writing. Full production tenant creation, membership APIs, onboarding field persistence, and dashboard tenant switching remain pending.
- 2026-07-11: Added first-phase dashboard store switching. The sidebar now shows a store selector when a tenant has multiple stores, `/api/stores/active` persists the selected store in an http-only cookie, and `getActiveTenant` prefers the selected store while also resolving tenant slug from the request host for API routes that do not pass middleware tenant headers. Cross-tenant account switching and onboarding field persistence remain pending.
- 2026-07-11: Added first-phase dashboard tenant switching. `getActiveTenant` now returns all active tenant memberships for the user, `/api/tenants/active` validates the selected tenant and stores an active-tenant cookie for local/dev routing, hosted dashboard switches return the selected tenant's dashboard URL, and the sidebar shows a tenant selector when the account belongs to more than one tenant. Onboarding field persistence remains pending.
- 2026-07-11: Added first-phase onboarding field persistence. The dashboard first-store setup form now captures business type, country/currency, main product category, sales method, and team size without expanding into a bulky questionnaire. Dashboard `POST /api/stores` and protected tRPC `tenant.createStore` accept the same onboarding payload, and `createTenantStore` stores cleaned values in `Store.metadata.retailOps.onboarding` with source, captured timestamp, and currency context.
- 2026-07-11: Added completed `OnboardingSession` persistence for first-store setup. Dashboard and tRPC store-creation paths now pass the acting user id into the shared helper, and onboarding submissions create a completed tenant/user session with the created store snapshot and cleaned setup answers. Richer setup branching, multi-step completion state, analytics, and manual browser validation remain pending.

## Linked Task
- Task Title: Multi-Business Signup And Onboarding
- Task File: brain/tasks/roadmap.md
