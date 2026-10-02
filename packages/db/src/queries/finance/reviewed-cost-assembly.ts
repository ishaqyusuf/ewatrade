import type { ReviewedAssemblyInput } from "./reviewed-cost-assembly-facts"
import { orderReviewedCostAssembly } from "./reviewed-cost-assembly-order"
import { buildReviewedCostAssemblySources } from "./reviewed-cost-assembly-sources"
import { financePayloadHash } from "./rules"

export type {
  ReviewedAssemblyPhysical,
  ReviewedAssemblyReturns,
  ReviewedMovementSemantics,
} from "./reviewed-cost-assembly-facts"

/**
 * Assemble complete quantity/cost dependencies. This consumes private persisted
 * reads; owning selectors, coordinated snapshot and monetary/journal proof remain
 * mandatory. No public caller may submit these graph objects as source authority.
 */
export function assembleReviewedCostTrace(input: ReviewedAssemblyInput) {
  const { physical, returns } = input
  const { pools, pending, returnPositions } =
    buildReviewedCostAssemblySources(input)
  const nodes = orderReviewedCostAssembly(pools, pending, returnPositions)
  return {
    tenantId: physical.tenantId,
    bookId: physical.bookId,
    currencyCode: physical.currencyCode,
    through: physical.through,
    pools: pools.sort((a, b) =>
      a.balanceSourceId.localeCompare(b.balanceSourceId),
    ),
    nodes: nodes.sort((a, b) => a.id.localeCompare(b.id)),
    assemblySnapshotHash: financePayloadHash({
      algorithmVersion: "canonical-source-assembly-v1",
      physicalSnapshotHash: physical.physicalSnapshotHash,
      returnSourceSnapshotHash: returns.sourceSnapshotHash,
      pools,
      nodes,
      semantics: [...input.semantics].sort((a, b) =>
        a.movementId.localeCompare(b.movementId),
      ),
    }),
    requiresOwningSourceProof: true as const,
    requiresCoordinatedSnapshotProof: true as const,
    requiresMonetaryProof: true as const,
    requiresPostedJournalProof: true as const,
  }
}
