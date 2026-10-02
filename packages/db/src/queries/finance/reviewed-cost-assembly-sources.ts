import { compareExactDecimals } from "@ewatrade/utils/exact-decimal"
import {
  type Pending,
  type ReviewedAssemblyInput,
  conflict,
  q,
  unique,
} from "./reviewed-cost-assembly-facts"
import type { ReviewedCostTracePool } from "./reviewed-cost-trace"
import { addQuantities, subtractQuantities } from "./valuation-math"

/** Normalize complete private reads and declared owning semantics into source dependencies. */
export function buildReviewedCostAssemblySources(input: ReviewedAssemblyInput) {
  const { physical, returns } = input
  if (
    physical.tenantId !== returns.snapshot.tenantId ||
    physical.bookId !== returns.snapshot.bookId ||
    physical.currencyCode !== returns.snapshot.currencyCode ||
    physical.bookSequence !== returns.snapshot.bookSequence ||
    !Number.isFinite(physical.through.getTime()) ||
    physical.balances.length === 0 ||
    physical.balances.length > 128
  )
    conflict(
      "Physical and original-return snapshots differ from the held financial context.",
    )
  unique(physical.balances.map((row) => row.balanceSourceId))
  unique(input.semantics.map((row) => row.movementId))
  unique(returns.allocations.map((row) => row.id))
  unique(returns.returns.map((row) => row.productReturnId))
  unique(returns.issues.map((row) => row.originalIssueId))
  const movements = new Map(
    physical.balances.flatMap((pool) =>
      pool.movements.map((row) => [row.id, row] as const),
    ),
  )
  if (
    movements.size !==
      physical.balances.reduce((n, pool) => n + pool.movements.length, 0) ||
    movements.size > 4096 ||
    input.semantics.length !== movements.size ||
    input.semantics.some((row) => !movements.has(row.movementId))
  )
    conflict(
      "Canonical assembly requires exactly one owning semantic proof for every physical movement.",
    )
  const semantics = new Map(input.semantics.map((row) => [row.movementId, row]))
  const pending = new Map<string, Pending>()
  const movementNodes = new Map<string, string[]>()
  const returnAllocationNodes = new Map<string, string>()
  const pools: ReviewedCostTracePool[] = physical.balances.map((pool) => {
    if (
      !pool.physicalQuantityReconciled ||
      pool.impliedBaselineQuantity !== "0" ||
      pool.issues.length ||
      !pool.orderedMovementIds ||
      pool.orderedMovementIds.length !== pool.movements.length ||
      new Set(pool.orderedMovementIds).size !== pool.movements.length ||
      pool.orderedMovementIds.some(
        (id) => !pool.movements.some((row) => row.id === id),
      )
    )
      conflict(
        "Canonical assembly requires complete unambiguous original physical history; legacy proof is missing.",
      )
    return {
      balanceSourceId: pool.balanceSourceId,
      tenantId: physical.tenantId,
      bookId: physical.bookId,
      currencyCode: physical.currencyCode,
      productId: pool.snapshot.productId,
      variantId: pool.snapshot.variantId,
      expectedEndingQuantity: q(pool.canonicalOnHandQuantity),
    }
  })
  function add(item: Pending) {
    if (
      pending.has(item.id) ||
      pending.size >= 4096 ||
      !Number.isFinite(item.effectiveAt.getTime()) ||
      item.effectiveAt > physical.through
    )
      conflict(
        "Canonical source identity/date or complete movement/return bound is invalid.",
      )
    pending.set(item.id, item)
  }
  const restockReturns = new Set<string>()
  for (const movement of movements.values()) {
    const semantic = semantics.get(movement.id)
    if (!semantic || !movement.valuation)
      conflict(
        "Original physical source semantic or registered event is missing.",
      )
    const effect = movement.signedCanonicalEffect
    const negative = effect.startsWith("-")
    const quantity = q(negative ? effect.slice(1) : effect)
    const base = {
      id: `movement:${movement.id}`,
      balanceSourceId: movement.balanceSourceId,
      effectiveAt: movement.operation.effectiveAt,
      quantityBefore: q(movement.canonicalBefore),
      quantityAfter: q(movement.canonicalAfter),
      quantity,
      recordedCostMinor: movement.valuation.sourceCostMinor,
    }
    if (
      (negative
        ? subtractQuantities(base.quantityBefore, quantity)
        : addQuantities(base.quantityBefore, quantity)) !== base.quantityAfter
    )
      conflict(
        "Canonical movement differs from its exact physical quantity delta.",
      )
    const ids: string[] = []
    if (semantic.kind === "RETURN_RESTOCK") {
      const header = returns.returns.find(
        (row) => row.productReturnId === semantic.productReturnId,
      )
      const source = returns.snapshot.returns.find(
        (row) => row.id === semantic.productReturnId,
      )
      if (
        negative ||
        !header ||
        header.disposition !== "RESTOCK" ||
        !source ||
        source.stockOperationId !== movement.operation.id ||
        source.destinationBalanceSourceId !== movement.balanceSourceId ||
        source.effectiveAt.getTime() !== base.effectiveAt.getTime() ||
        q(header.canonicalQuantity) !== quantity ||
        header.sourceCostMinor !== base.recordedCostMinor ||
        restockReturns.has(header.productReturnId)
      )
        conflict(
          "Restock assembly differs from its original registered recovery source.",
        )
      restockReturns.add(header.productReturnId)
      let before = base.quantityBefore
      // Allocations of distinct original issues within one physical recovery
      // commute. Stable IDs serialize that split, not separate physical events.
      const allocations = returns.allocations
        .filter((row) => row.returnCostId === header.id)
        .sort((a, b) => a.fulfillmentId.localeCompare(b.fulfillmentId))
      for (const allocation of allocations) {
        const after = addQuantities(before, q(allocation.canonicalQuantity))
        const id = `return-allocation:${allocation.id}`
        add({
          id,
          balanceSourceId: base.balanceSourceId,
          effectiveAt: base.effectiveAt,
          parents: new Set(ids.length ? [ids[ids.length - 1] ?? ""] : []),
          node: {
            ...base,
            id,
            quantityBefore: before,
            quantityAfter: after,
            quantity: q(allocation.canonicalQuantity),
            recordedCostMinor: allocation.sourceCostMinor,
            kind: "RETURN_RESTOCK",
            originalIssueId: "",
            returnOrdinal: 0n,
            originalRemainingQuantityBefore: q(
              allocation.remainingQuantityBefore,
            ),
          },
          allocation,
          nonphysical: false,
        })
        returnAllocationNodes.set(allocation.id, id)
        ids.push(id)
        before = after
      }
      if (!ids.length || before !== base.quantityAfter)
        conflict(
          "Restock allocations do not cover the complete physical recovery.",
        )
    } else if (semantic.kind === "RESTORATION") {
      const original = movements.get(semantic.originalMovementId)
      const originalSemantic = semantics.get(semantic.originalMovementId)
      if (
        negative ||
        !original ||
        originalSemantic?.kind !== "WITHDRAWAL" ||
        originalSemantic.purpose !== "ORDINARY" ||
        original.balanceSourceId !== movement.balanceSourceId ||
        original.signedCanonicalEffect !== `-${quantity}`
      )
        conflict(
          "Ordinary restoration must recover its complete original withdrawal in the same pool.",
        )
      add({
        id: base.id,
        balanceSourceId: base.balanceSourceId,
        effectiveAt: base.effectiveAt,
        parents: new Set([`movement:${original.id}`]),
        node: {
          ...base,
          kind: "RESTORATION",
          originalIssueId: `movement:${original.id}`,
          returnOrdinal: 1n,
          originalRemainingQuantityBefore: quantity,
        },
        allocation: null,
        nonphysical: false,
      })
      ids.push(base.id)
    } else {
      if (
        (semantic.kind === "WITHDRAWAL" || semantic.kind === "TRANSFER_OUT") !==
          negative ||
        (quantity === "0" &&
          (semantic.kind !== "ORIGIN" || base.recordedCostMinor !== 0n))
      )
        conflict(
          "Owning source semantics differ from the exact physical effect.",
        )
      const node =
        semantic.kind === "TRANSFER_IN"
          ? ({
              ...base,
              kind: semantic.kind,
              sourceEventId: `movement:${semantic.originalMovementId}`,
            } as const)
          : semantic.kind === "WITHDRAWAL"
            ? ({
                ...base,
                kind: semantic.kind,
                purpose: semantic.purpose,
              } as const)
            : ({ ...base, kind: semantic.kind } as const)
      add({
        id: base.id,
        balanceSourceId: base.balanceSourceId,
        effectiveAt: base.effectiveAt,
        parents: new Set(),
        node,
        allocation: null,
        nonphysical: false,
      })
      ids.push(base.id)
    }
    movementNodes.set(movement.id, ids)
  }
  const fulfillmentMovements = new Map(
    returns.snapshot.fulfillments.map((row) => [row.id, row.stockMovementId]),
  )
  const issues = new Map(returns.issues.map((row) => [row.fulfillmentId, row]))
  for (const header of returns.returns) {
    const source = returns.snapshot.returns.find(
      (row) => row.id === header.productReturnId,
    )
    if (
      !source ||
      header.tenantId !== physical.tenantId ||
      header.bookId !== physical.bookId ||
      source.orderLineId !== header.orderLineId ||
      source.disposition !== header.disposition
    )
      conflict("Return source is missing or crosses the assembly context.")
    if (header.disposition === "RESTOCK") {
      if (!restockReturns.has(header.productReturnId))
        conflict(
          "Restock source has no complete physical recovery in this component.",
        )
      continue
    }
    if (
      source.stockOperationId !== null ||
      source.destinationBalanceSourceId !== null
    )
      conflict("Nonphysical return cannot own a recovery movement.")
    const allocations = returns.allocations.filter(
      (row) => row.returnCostId === header.id,
    )
    let allocated = "0"
    for (const allocation of allocations) {
      const originalMovementId = fulfillmentMovements.get(
        allocation.fulfillmentId,
      )
      const original = originalMovementId
        ? movements.get(originalMovementId)
        : null
      if (!original)
        conflict(
          "Nonphysical return has no original physical issue in the component.",
        )
      const id = `return-allocation:${allocation.id}`
      add({
        id,
        balanceSourceId: original.balanceSourceId,
        effectiveAt: source.effectiveAt,
        parents: new Set(),
        node: null,
        allocation,
        nonphysical: true,
      })
      returnAllocationNodes.set(allocation.id, id)
      allocated = addQuantities(allocated, q(allocation.canonicalQuantity))
    }
    if (!allocations.length || allocated !== q(header.canonicalQuantity))
      conflict(
        "Nonphysical return budget is incomplete; legacy proof is required.",
      )
  }
  if (returnAllocationNodes.size !== returns.allocations.length)
    conflict("Canonical assembly cannot omit any original return allocation.")
  for (const pool of physical.balances) {
    let previous: string | undefined
    for (const movementId of pool.orderedMovementIds ?? []) {
      const ids = movementNodes.get(movementId)
      if (!ids?.length) conflict("Certified physical order lost a source node.")
      const first = pending.get(ids[0] ?? "")
      if (!first) conflict("Certified physical order lost its first node.")
      if (previous) first.parents.add(previous)
      previous = ids[ids.length - 1]
    }
  }
  const returnPositions = new Map<
    string,
    { ordinal: bigint; originalIssueNodeId: string }
  >()
  for (const issue of returns.issues) {
    const movementId = fulfillmentMovements.get(issue.fulfillmentId)
    const original = movementId ? movements.get(movementId) : null
    const semantic = movementId ? semantics.get(movementId) : null
    if (
      !original ||
      issue.tenantId !== physical.tenantId ||
      issue.bookId !== physical.bookId ||
      original.valuation?.id !== issue.originalIssueId ||
      semantic?.kind !== "WITHDRAWAL" ||
      semantic.purpose !== "PRODUCT_ISSUE" ||
      original.signedCanonicalEffect !== `-${q(issue.canonicalQuantity)}` ||
      original.valuation.sourceCostMinor !== issue.sourceCostMinor
    )
      conflict(
        "Original return issue differs from its physical Product withdrawal.",
      )
    const chain = returns.allocations
      .filter((row) => row.fulfillmentId === issue.fulfillmentId)
      .sort((a, b) =>
        compareExactDecimals(
          b.remainingQuantityBefore,
          a.remainingQuantityBefore,
        ),
      )
    let remaining = q(issue.canonicalQuantity)
    let previous = `movement:${original.id}`
    for (const [index, allocation] of chain.entries()) {
      const id = returnAllocationNodes.get(allocation.id)
      const item = id ? pending.get(id) : null
      if (
        !item ||
        allocation.tenantId !== physical.tenantId ||
        allocation.bookId !== physical.bookId ||
        allocation.orderLineId !== issue.orderLineId ||
        allocation.originalIssueId !== issue.originalIssueId ||
        q(allocation.remainingQuantityBefore) !== remaining ||
        q(allocation.canonicalQuantity) === "0"
      )
        conflict(
          "Canonical return allocation chain is missing, forked or crossed.",
        )
      const sourcePool = pools.find(
        (pool) => pool.balanceSourceId === original.balanceSourceId,
      )
      const targetPool = pools.find(
        (pool) => pool.balanceSourceId === item.balanceSourceId,
      )
      if (
        !sourcePool ||
        !targetPool ||
        sourcePool.productId !== targetPool.productId ||
        sourcePool.variantId !== targetPool.variantId
      )
        conflict(
          "Canonical return allocation changes its original Product/Variant.",
        )
      remaining = subtractQuantities(remaining, q(allocation.canonicalQuantity))
      if (q(allocation.remainingQuantityAfter) !== remaining)
        conflict(
          "Canonical return residual quantity differs from its original allowance.",
        )
      item.parents.add(previous)
      returnPositions.set(allocation.id, {
        ordinal: BigInt(index + 1),
        originalIssueNodeId: `movement:${original.id}`,
      })
      previous = item.id
    }
  }
  if (
    returnPositions.size !== returns.allocations.length ||
    issues.size !== returns.issues.length
  )
    conflict("Canonical return sources are missing or duplicated.")
  const transferred = new Map<string, number>()
  for (const item of pending.values()) {
    if (item.node?.kind === "TRANSFER_IN") {
      const source = pending.get(item.node.sourceEventId)
      const sourcePool = pools.find(
        (pool) => pool.balanceSourceId === source?.balanceSourceId,
      )
      const targetPool = pools.find(
        (pool) => pool.balanceSourceId === item.balanceSourceId,
      )
      if (
        source?.node?.kind !== "TRANSFER_OUT" ||
        source.balanceSourceId === item.balanceSourceId ||
        source.node.quantity !== item.node.quantity ||
        !sourcePool ||
        !targetPool ||
        sourcePool.productId !== targetPool.productId ||
        sourcePool.variantId !== targetPool.variantId
      )
        conflict(
          "Canonical transfer needs one equal original outgoing allocation with the same Product/Variant.",
        )
      item.parents.add(item.node.sourceEventId)
      transferred.set(source.id, (transferred.get(source.id) ?? 0) + 1)
    }
    for (const id of item.parents) {
      const parent = pending.get(id)
      if (
        !parent ||
        parent.id === item.id ||
        parent.effectiveAt > item.effectiveAt
      )
        conflict(
          "Canonical source dependencies are missing, reversed or self-linked.",
        )
    }
  }
  for (const item of pending.values())
    if (item.node?.kind === "TRANSFER_OUT" && transferred.get(item.id) !== 1)
      conflict(
        "Canonical transfer source is incomplete or has duplicated incoming value.",
      )
  return { pools, pending, returnPositions }
}
