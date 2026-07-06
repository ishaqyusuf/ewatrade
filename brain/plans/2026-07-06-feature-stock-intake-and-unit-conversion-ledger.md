# Plan: Stock Intake And Unit Conversion Ledger

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
- Intake Item: When feed production is delivered, set bags delivered and add to inventory; some bags can be rebagged into half and quarter.

## Goal Or Problem
Track delivered stock and unit conversions through an auditable inventory ledger so merchants know exactly how much stock exists in each sellable unit and why balances changed.

## Current Context
The current `InventoryItem` model tracks on-hand and reserved quantity for a product variant, but it does not model stock deliveries, production receipts, rebagging/conversions, losses, or an inventory movement ledger.

## Proposed Approach
Introduce stock delivery and inventory movement records. Store quantities in a base-unit-safe representation while allowing UI balances by sellable unit. Model rebagging as ledger movements that reduce one unit and increase another according to conversion ratios. Keep source, actor, notes, and timestamps for auditability.

## Implementation Steps
- Add schema for stock deliveries/receipts with source, date, received-by user, notes, and line items.
- Add schema for inventory movements with type, product, unit, quantity, actor, source reference, and metadata.
- Add movement types for delivery, conversion-out, conversion-in, assignment, sale, return, damage, loss, and adjustment.
- Implement service/repository logic that updates inventory balances transactionally from ledger movements.
- Build dashboard UI for recording delivered production/supplier stock.
- Build dashboard UI for converting stock between units, including validation against available stock.
- Add audit views for stock delivery and conversion history.

## Affected Files Or Areas
- `packages/db/prisma/models/commerce.prisma`
- `packages/db/src`
- `apps/dashboard`
- `apps/pos`
- `brain/database/schema.md`
- `brain/modules/merchant-system.md`

## Acceptance Criteria
- Admin can record delivered stock and inventory increases accordingly.
- Admin can convert full bags into half/quarter units and balances update correctly.
- Each inventory balance change has a corresponding ledger/audit record.
- Conversion cannot create stock beyond available source quantity.
- Stock delivery and conversion history can be viewed by product and date.

## Test Plan
- Run `bun run db:generate`.
- Run `bun run typecheck`.
- Add or run ledger tests for delivery, conversion, insufficient stock, and rollback on failure.
- Manually verify inventory balance before and after conversion.

## Brain Update Requirements
- Update `brain/database/schema.md`, `brain/modules/merchant-system.md`, and feature docs for inventory movements.

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
- Mixed-unit inventory can drift if updates bypass the ledger.
- Rebagging may have waste/loss that needs explicit accounting.
- Concurrent conversions and sales require transaction isolation.

## Open Questions
- TODO: Confirm whether production delivery and supplier delivery need separate source models in MVP.

## Linked Task
- Task Title: Stock Intake And Unit Conversion Ledger
- Task File: brain/tasks/roadmap.md
