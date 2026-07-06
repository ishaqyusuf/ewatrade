# Plan: Flexible Product Units And Price History

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
- Intake Item: Set product, units, reusable unit base, and feed price with price history.

## Goal Or Problem
Let merchants define products with flexible sellable units such as bag, half bag, and quarter bag, and keep durable price history so historical sales reports use the correct price at the time of sale.

## Current Context
The current commerce schema has `Product`, `ProductVariant`, and `InventoryItem`. Product variants have `priceMinor`, but there is no explicit unit conversion model, unit template library, or price history entity.

## Proposed Approach
Introduce a unit system where each product has a base unit and one or more sellable units with conversion ratios to the base unit. Add reusable unit templates for common businesses. Add price history records with effective dates, actor, and optional reason. Preserve variant/order snapshots so reports remain stable.

## Implementation Steps
- Define schema additions for unit templates, product units, unit conversion ratios, and price history.
- Decide how `ProductVariant` maps to sellable units or whether a new product-unit entity should become the sellable SKU boundary.
- Seed or expose reusable templates: Bag/Half/Quarter, Crate/Bottle, Carton/Piece, Roll/Meter, Kg/Gram, Dozen/Piece, Bucket/Liter.
- Add dashboard product setup UI for selecting a template or creating custom units.
- Add price-setting UI with current price, effective date, changed-by user, and optional reason/comment.
- Ensure order/sale line items snapshot unit name, conversion ratio, and unit price at sale time.
- Add validation for conversion ratios, duplicate unit names, and future-dated prices.

## Affected Files Or Areas
- `packages/db/prisma/models/commerce.prisma`
- `packages/db/prisma/models/enums.prisma`
- `apps/dashboard`
- `apps/pos`
- `packages/db/src`
- `brain/database/schema.md`

## Acceptance Criteria
- A merchant can create a product with a main unit and derived units.
- A merchant can select from reusable unit templates and customize unit names/ratios.
- Price changes are stored as history with effective date, actor, and optional reason.
- Sales created after a price change use the effective current price.
- Historical sales retain their original unit and price snapshot.

## Test Plan
- Run `bun run db:generate` after schema changes.
- Run `bun run typecheck`.
- Add or run domain tests for unit conversion and price lookup by effective date.
- Manually verify a price change does not rewrite prior sales.

## Brain Update Requirements
- Update `brain/database/schema.md`, `brain/modules/merchant-system.md`, and create/update a feature doc for product units and price history.

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
- Fractional units can cause rounding errors if stored as floats; prefer integer ratio numerator/denominator or decimal-safe representation.
- Price effective dates must handle timezone and backdated correction rules.
- Inventory may need base-unit quantities while UI shows sellable unit quantities.

## Open Questions
- TODO: Confirm whether merchants can price derived units independently from base-unit conversion math.

## Linked Task
- Task Title: Flexible Product Units And Price History
- Task File: brain/tasks/roadmap.md
