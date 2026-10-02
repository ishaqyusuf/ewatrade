import type { readReviewedCostPhysicalHistoryInTransaction } from "./reviewed-cost-history"
import type { readReviewedCostOwningSourcesInTransaction } from "./reviewed-cost-owners"
import { FinanceError, financePayloadHash } from "./rules"

type Physical = Awaited<
  ReturnType<typeof readReviewedCostPhysicalHistoryInTransaction>
>
type Owners = Awaited<
  ReturnType<typeof readReviewedCostOwningSourcesInTransaction>
>

/** Actual source-owned projections must agree with the certified physical read. */
export function assertReviewedCostOwnerBindings(
  physical: Pick<Physical, "balances">,
  owners: Pick<Owners, "operationBindings" | "movementBindings">,
) {
  const operations = new Map(
    owners.operationBindings.map((row) => [row.id, row]),
  )
  const movements = new Map(owners.movementBindings.map((row) => [row.id, row]))
  const actual = physical.balances.flatMap((pool) => pool.movements)
  if (
    operations.size !== owners.operationBindings.length ||
    movements.size !== owners.movementBindings.length ||
    movements.size !== actual.length ||
    new Set(actual.map((row) => row.id)).size !== actual.length ||
    operations.size !== new Set(actual.map((row) => row.operation.id)).size
  )
    throw new FinanceError(
      "CONFLICT",
      "Owning source bindings do not cover the complete physical history.",
    )
  for (const row of actual) {
    const {
      operation,
      unit: _unit,
      canonicalBefore: _before,
      canonicalAfter: _after,
      ...movement
    } = row
    const original = movements.get(row.id)
    if (
      !original ||
      original.operationId !== operation.id ||
      financePayloadHash(operations.get(operation.id)) !==
        financePayloadHash(operation)
    )
      throw new FinanceError(
        "CONFLICT",
        "Owning operation differs from certified physical history.",
      )
    const { operationId: _operationId, ...originalMovement } = original
    if (financePayloadHash(originalMovement) !== financePayloadHash(movement))
      throw new FinanceError(
        "CONFLICT",
        "Original movement/event differs from certified physical history.",
      )
  }
}
