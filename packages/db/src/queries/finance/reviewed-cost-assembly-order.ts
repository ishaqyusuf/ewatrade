import { type Pending, conflict, q } from "./reviewed-cost-assembly-facts"
import type {
  ReviewedCostTraceNode,
  ReviewedCostTracePool,
} from "./reviewed-cost-trace"

/** Physical sequence edges retain authority; neutral metadata commutes between unrelated ready sources. */
export function orderReviewedCostAssembly(
  pools: ReviewedCostTracePool[],
  pending: Map<string, Pending>,
  returnPositions: Map<
    string,
    { ordinal: bigint; originalIssueNodeId: string }
  >,
) {
  const children = new Map<string, string[]>()
  for (const item of pending.values())
    for (const parent of item.parents) {
      const list = children.get(parent) ?? []
      list.push(item.id)
      children.set(parent, list)
    }
  const ready = [...pending.values()].filter((row) => row.parents.size === 0)
  const quantities = new Map(pools.map((pool) => [pool.balanceSourceId, "0"]))
  const ordinals = new Map<string, bigint>()
  const nodes: ReviewedCostTraceNode[] = []
  while (ready.length) {
    // Physical ordering is already forced by certified sequence edges. Owning
    // dates only interleave quantity-neutral metadata among unrelated ready nodes.
    ready.sort(
      (a, b) =>
        b.effectiveAt.getTime() - a.effectiveAt.getTime() ||
        b.id.localeCompare(a.id),
    )
    const item = ready.pop()
    if (!item) conflict("Canonical dependency traversal lost a source.")
    const before = quantities.get(item.balanceSourceId)
    if (before === undefined) conflict("Canonical node has no original pool.")
    let node = item.node
    if (item.allocation) {
      const position = returnPositions.get(item.allocation.id)
      if (!position)
        conflict("Original return allocation has no proved chain position.")
      node = item.nonphysical
        ? {
            id: item.id,
            balanceSourceId: item.balanceSourceId,
            effectiveAt: item.effectiveAt,
            quantityBefore: before,
            quantityAfter: before,
            quantity: q(item.allocation.canonicalQuantity),
            recordedCostMinor: item.allocation.sourceCostMinor,
            kind: "RETURN_NON_RESTOCK",
            originalIssueId: position.originalIssueNodeId,
            returnOrdinal: position.ordinal,
            originalRemainingQuantityBefore: q(
              item.allocation.remainingQuantityBefore,
            ),
          }
        : (() => {
            if (node?.kind !== "RETURN_RESTOCK")
              conflict("Return split lost its physical recovery node.")
            return {
              ...node,
              originalIssueId: position.originalIssueNodeId,
              returnOrdinal: position.ordinal,
            }
          })()
    }
    if (!node || node.quantityBefore !== before)
      conflict("Canonical nodes do not retain certified physical quantities.")
    const ordinal = (ordinals.get(item.balanceSourceId) ?? 0n) + 1n
    nodes.push({ ...node, ordinal })
    ordinals.set(item.balanceSourceId, ordinal)
    quantities.set(item.balanceSourceId, node.quantityAfter)
    for (const id of children.get(item.id) ?? []) {
      const child = pending.get(id)
      child?.parents.delete(item.id)
      if (child?.parents.size === 0) ready.push(child)
    }
  }
  if (nodes.length !== pending.size)
    conflict("Canonical source/return dependencies contain a cycle.")
  for (const pool of pools)
    if (quantities.get(pool.balanceSourceId) !== pool.expectedEndingQuantity)
      conflict(
        "Canonical source assembly does not reconcile complete ending stock.",
      )
  return nodes
}
