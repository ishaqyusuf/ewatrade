# Plan: Retail Sales Product Documentation

## Type
Docs

## Status
Proposed

## Created Date
2026-07-06

## Last Updated
2026-07-06

## Intake
- Intake File: brain/intake/2026-07-06-sales-management-saas-mvp.md
- Intake Item: Align ewatrade scope around the Retail Ops/Sales MVP and document the A-Z product direction.

## Goal Or Problem
Update Brain documentation so the Retail Ops/Sales MVP is clearly represented as a first product wedge inside ewatrade, with rabbit feed as a starter template rather than the entire product identity.

## Current Context
Brain currently describes ewatrade as commerce and logistics infrastructure for African merchants, with POS and merchant operations in scope. It does not yet document the flexible-unit sales-rep reconciliation MVP as a coherent product slice.

## Proposed Approach
Create or update Brain product, module, feature, workflow, and roadmap docs to describe the Retail Ops MVP. Capture positioning, personas, workflow, core entities, reports, offline expectations, subscription model, and open questions. Keep implementation docs aligned with generated plans.

## Implementation Steps
- Update product vision/roadmap to mention Retail Ops/Sales as an MVP wedge.
- Update merchant system and POS module docs with product units, stock ledger, rep wallets, daily sessions, sales, closeout, offline sync, and reports.
- Create feature doc for Retail Ops Sales MVP.
- Create workflow doc for receive stock -> convert units -> assign reps -> clock in -> sell -> closeout -> reconcile.
- Update database schema docs as schema plans land.
- Add open questions for business naming, offline target, billing provider, and payment/credit rules.

## Affected Files Or Areas
- `brain/product/vision.md`
- `brain/product/roadmap.md`
- `brain/modules/merchant-system.md`
- `brain/modules/pos-cashier.md`
- `brain/features`
- `brain/workflows`
- `brain/database/schema.md`

## Acceptance Criteria
- Brain documents Retail Ops/Sales as an explicit ewatrade MVP product direction.
- Rabbit feed is documented as a starter example/template, not a narrow product boundary.
- Core workflow and entities are described in durable Brain docs.
- Open questions and implementation sequencing are documented.
- Docs link back to relevant plans or intake where useful.

## Test Plan
- Manual review docs for consistency with this intake and generated plans.
- Run markdown lint/check only if the project has a configured non-mutating docs check.

## Brain Update Requirements
- This plan is entirely a Brain documentation update.

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
- Docs may conflict with existing broader commerce/logistics positioning if the MVP wedge is written as a replacement rather than a prioritization.
- Plans and docs can drift if implementation changes schema or scope.

## Open Questions
- None.

## Linked Task
- Task Title: Retail Sales Product Documentation
- Task File: brain/tasks/roadmap.md
