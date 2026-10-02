import type { discoverReviewedCostSourcesInTransaction } from "./reviewed-cost-discovery"
import type { readReviewedCostPhysicalHistoryInTransaction } from "./reviewed-cost-history"
import type { readReviewedCostReturnsInTransaction } from "./reviewed-cost-returns"
import { FinanceError, financePayloadHash } from "./rules"

type Discovery = Awaited<
  ReturnType<typeof discoverReviewedCostSourcesInTransaction>
>
type Physical = Awaited<
  ReturnType<typeof readReviewedCostPhysicalHistoryInTransaction>
>
type Returns = Awaited<ReturnType<typeof readReviewedCostReturnsInTransaction>>

function conflict(message: string): never {
  throw new FinanceError("CONFLICT", message)
}
function sameIds(expected: string[], actual: string[], label: string) {
  if (
    actual.some((id) => !id.trim()) ||
    new Set(actual).size !== actual.length ||
    financePayloadHash([...expected].sort()) !==
      financePayloadHash([...actual].sort())
  )
    conflict(`Connected ${label} differs from the complete discovered scope.`)
}
export function assertUnchangedReviewedCostDiscovery(
  before: Discovery,
  after: Discovery,
) {
  if (financePayloadHash(before) !== financePayloadHash(after))
    conflict("Connected source discovery changed; retry the whole snapshot.")
}

/** Binds proved inputs without granting semantics, fiscal or monetary authority. */
export function auditReviewedCostConnectedSnapshot(input: {
  discovery: Discovery
  physical: Physical
  returns: Returns
  revalidatedDiscovery: Discovery
  revalidatedReturns: Returns
}) {
  const { discovery, physical, returns } = input
  assertUnchangedReviewedCostDiscovery(discovery, input.revalidatedDiscovery)
  if (
    !Number.isFinite(physical.through.getTime()) ||
    [returns, input.revalidatedReturns].some((source) =>
      source.snapshot.returns.some(
        (row) =>
          !Number.isFinite(row.effectiveAt.getTime()) ||
          row.effectiveAt > physical.through,
      ),
    )
  )
    conflict(
      "Complete Product returns extend beyond the physical history-through time.",
    )
  if (
    financePayloadHash(returns) !== financePayloadHash(input.revalidatedReturns)
  )
    conflict("Original Product return facts changed; retry the whole snapshot.")
  for (const scope of [physical, returns.snapshot]) {
    if (
      scope.tenantId !== discovery.tenantId ||
      scope.bookId !== discovery.bookId ||
      scope.currencyCode !== discovery.currencyCode ||
      scope.bookSequence !== discovery.bookSequence
    )
      conflict("Connected snapshots differ from the same Tenant/currency Book.")
  }
  sameIds(
    discovery.balanceSourceIds,
    physical.balances.map((row) => row.balanceSourceId),
    "balances",
  )
  const movements = physical.balances.flatMap((row) => row.movements)
  sameIds(
    discovery.movementIds,
    movements.map((row) => row.id),
    "movements",
  )
  sameIds(
    discovery.operationIds,
    [...new Set(movements.map((row) => row.operation.id))],
    "operations",
  )
  sameIds(
    discovery.orderLineIds,
    returns.snapshot.lines.map((row) => row.id),
    "owning Order Lines",
  )
  sameIds(
    discovery.productReturnIds,
    returns.snapshot.returns.map((row) => row.id),
    "Product returns",
  )
  const snapshot = { discovery, physical, returns }
  return {
    ...snapshot,
    scope: "CONNECTED_PHYSICAL_AND_PRODUCT_RETURNS" as const,
    connectedSnapshotHash: financePayloadHash({
      algorithmVersion: "connected-physical-return-snapshot-v1",
      ...snapshot,
    }),
    requiresOwningSourceProof: true as const,
    requiresMonetaryProof: true as const,
    requiresPostedJournalProof: true as const,
    requiresPriorReviewProof: true as const,
  }
}
