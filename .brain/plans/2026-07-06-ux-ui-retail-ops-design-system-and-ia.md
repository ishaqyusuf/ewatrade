# Plan: Retail Ops Design System And IA

## Type
UX/UI

## Status
Completed

## Created Date
2026-07-06

## Last Updated
2026-07-10

## Intake
- Intake File: .brain/intake/2026-07-06-sales-management-saas-mvp.md
- Intake Item: Find best sales-management designs and establish the design system before implementation.

## Goal Or Problem
Define the product information architecture, core screens, and reusable UI system for an offline-first retail sales operations app before deeper feature implementation begins.

## Current Context
The project already has `apps/marketing`, `apps/pos`, `apps/dashboard`, and `packages/ui`. Brain currently positions ewatrade as a multi-tenant commerce, logistics, POS, and merchant operations platform. Existing app surfaces are mostly scaffolded and do not yet express the focused retail sales-rep workflow.

The Retail Ops design system and IA is now documented in `.brain/features/retail-ops-design-system-and-ia.md`. That doc defines the role split, surface ownership, screen map, reusable components, operational state language, architecture boundaries, implementation constraints, and acceptance review checklist for future Retail Ops slices.

## Design References
- Smart Sales & Order Management Mobile App by Sujon Hossain on Dribbble: https://dribbble.com/shots/27067100-Smart-Sales-Order-Management-Mobile-App
  - Use as the primary early mobile visual reference for `mobile`.
  - Borrow the emphasis on sales performance cards, order status visibility, analytics snapshots, simple onboarding, profile/settings, notifications, and quick navigation.
  - Adapt the pattern toward inventory custody, rep workflows, offline sync, and end-of-day reconciliation instead of copying it as a generic sales dashboard.

## Proposed Approach
Audit strong sales/POS/inventory dashboard patterns, then translate the relevant patterns into an ewatrade Retail Ops design system. Define screen-level IA for owner/admin dashboard, POS/rep selling surface, onboarding, inventory, reports, offline/sync states, and end-of-day closeout. Update shared UI guidance and produce implementation-ready screen notes without building the app code in this plan.

## Implementation Steps
- Review current styling conventions in `apps/marketing`, `apps/pos`, `apps/dashboard`, and `packages/ui`.
- Collect design references for sales management, POS, inventory, reconciliation, and offline state patterns.
- Define primary user roles and navigation: owner/admin, manager, sales rep/cashier, and platform admin if needed.
- Create a screen map for onboarding, product units, inventory, rep stock wallet, selling, closeout, reports, billing, and settings.
- Define visual principles for operational SaaS: dense but calm dashboards, quick action flows, clear variance/error states, and mobile-first POS usability.
- Define reusable components and states: product unit selector, quantity steppers, stock balance cards, sync status, reconciliation table, approval drawer, report filters, and role-aware nav.
- Update or create Brain design documentation with the IA and component guidance.

## Affected Files Or Areas
- `apps/dashboard`
- `apps/pos`
- `apps/marketing`
- `packages/ui`
- `.brain/features`
- `.brain/modules/pos-cashier.md`
- `.brain/modules/merchant-system.md`

## Acceptance Criteria
- The Retail Ops MVP has a documented IA and screen map.
- The design system defines reusable components/states required by the MVP.
- Offline/sync, shortage, credit, and closeout variance states are covered.
- Existing app surfaces have a clear ownership split for dashboard versus POS/rep workflows.
- Brain docs record design decisions and implementation constraints.

## Test Plan
- Manual review of the screen map against all generated Retail Ops plans.
- Manual review that each required feature has an owner surface and a rep/POS surface where applicable.
- Run `bun run typecheck` only if code/docs import references are changed during implementation.

## Brain Update Requirements
- Update `.brain/product/vision.md`, `.brain/modules/merchant-system.md`, `.brain/modules/pos-cashier.md`, and a feature/design doc under `.brain/features`.

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
- Design inspiration may overfit polished analytics screens and under-serve fast daily sales workflows.
- Offline/sync states must be visible without crowding the rep selling flow.
- Dashboard density must remain usable on small laptops and tablets.

## Open Questions
- TODO: Confirm whether mobile-first PWA is the primary target for reps.

## Progress Notes
- 2026-07-10: Added `.brain/features/retail-ops-design-system-and-ia.md` and linked it from product, merchant, POS, and feature docs. The IA now covers owner/admin, manager, attendant, platform admin, mobile, dashboard, POS, and web share-link surfaces; onboarding, dashboard, selling, inventory, staff, closeout, reports, and subscription screen maps; reusable mobile/dashboard components; offline/sync, shortage, credit, and variance states; and implementation constraints for NativeWind-first reusable UI.

## Linked Task
- Task Title: Retail Ops Design System And IA
- Task File: .brain/tasks/roadmap.md
