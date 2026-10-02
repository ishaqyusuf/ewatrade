import { FinanceError, financePayloadHash } from "./rules"
import {
  addQuantities,
  calculateWeightedAverageIssue,
  normalizeQuantity,
  subtractQuantities,
} from "./valuation-math"

const ZERO = 0n
const MAX_MINOR = 9223372036854775807n
const TRACE_VERSION = "weighted-average-original-return-v1"

type CommonNode = {
  id: string
  balanceSourceId: string
  /** Private trace order, including return metadata; not a physical movement sequence. */
  ordinal: bigint
  effectiveAt: Date
  quantityBefore: string
  quantityAfter: string
  quantity: string
  recordedCostMinor: bigint | null
}
type WithdrawalPurpose =
  | "PRODUCT_ISSUE"
  | "STANDALONE_COMMITMENT"
  | "ORDINARY"
  | "COUNT_SHORTAGE"
  | "CLOSEOUT_SHORTAGE"
  | "SUPPLIER_RETURN"
export type ReviewedCostTraceNode = CommonNode &
  (
    | { kind: "ORIGIN" }
    | { kind: "WITHDRAWAL"; purpose: WithdrawalPurpose }
    | { kind: "TRANSFER_OUT" }
    | { kind: "TRANSFER_IN"; sourceEventId: string }
    | {
        kind: "RETURN_RESTOCK" | "RETURN_NON_RESTOCK" | "RESTORATION"
        originalIssueId: string
        returnOrdinal: bigint
        originalRemainingQuantityBefore: string
      }
  )
export type ReviewedCostTracePool = {
  balanceSourceId: string
  tenantId: string
  bookId: string
  currencyCode: string
  productId: string
  variantId: string
  expectedEndingQuantity: string
}
export type ReviewedCostEvidence = {
  eventId: string
  originalCostMinor: bigint
  evidenceReference: string
  mode: "RESOLVE_UNKNOWN" | "CORRECT_RECORDED"
}
type CostState = { quantity: string; valueMinor: bigint | null }
type Allocation = {
  node: ReviewedCostTraceNode
  resolvedCostMinor: bigint | null
  recordedCostMinor: bigint | null
  /** Unknown recorded cost is not treated as an already-posted zero journal. */
  differenceMinor: bigint | null
}

function conflict(message: string): never {
  throw new FinanceError("CONFLICT", message)
}
function amount(value: bigint) {
  if (typeof value !== "bigint" || value < ZERO || value > MAX_MINOR)
    conflict(
      "Reviewed cost must fit a non-negative database minor-unit amount.",
    )
  return value
}
function quantity(value: string) {
  try {
    return normalizeQuantity(value)
  } catch {
    conflict("Reviewed trace quantity exceeds its exact supported bounds.")
  }
}
function sum(values: Array<bigint | null>): bigint | null {
  if (values.some((value) => value === null)) return null
  return values.reduce<bigint>((total, value) => total + (value ?? ZERO), ZERO)
}
function addValue(before: bigint | null, incoming: bigint | null) {
  return before === null || incoming === null ? null : amount(before + incoming)
}
function addQuantity(before: string, incoming: string) {
  try {
    return addQuantities(before, incoming)
  } catch {
    conflict(
      "Reviewed trace quantity addition exceeds its exact supported bounds.",
    )
  }
}
function issue(state: CostState, issued: string) {
  try {
    if (state.valueMinor === null)
      return {
        after: {
          quantity: subtractQuantities(state.quantity, issued),
          valueMinor: null,
        },
        cost: null,
      }
    const result = calculateWeightedAverageIssue({
      quantityBefore: state.quantity,
      valueBeforeMinor: state.valueMinor,
      quantityIssued: issued,
    })
    return {
      after: {
        quantity: result.quantityAfter,
        valueMinor: result.valueAfterMinor,
      },
      cost: result.valueIssuedMinor,
    }
  } catch {
    conflict(
      "Reviewed withdrawal exceeds its original remaining quantity or cost bounds.",
    )
  }
}

/**
 * Private, pure shadow calculation from a complete canonical source trace.
 * It grants no evidence/permission, rewrites no saved facts and emits no journals.
 * A repository must prove source ownership, history completeness and review scope.
 */
export function previewReviewedInventoryCostTrace(input: {
  tenantId: string
  bookId: string
  currencyCode: string
  through: Date
  now: Date
  pools: ReviewedCostTracePool[]
  nodes: ReviewedCostTraceNode[]
  evidence: ReviewedCostEvidence[]
}) {
  if (
    !input.tenantId.trim() ||
    !input.bookId.trim() ||
    !input.currencyCode.trim() ||
    !Number.isFinite(input.through.getTime()) ||
    !Number.isFinite(input.now.getTime()) ||
    input.through > input.now ||
    input.pools.length === 0 ||
    input.pools.length > 128 ||
    input.nodes.length === 0 ||
    input.nodes.length > 4096 ||
    input.evidence.length > input.nodes.length
  )
    conflict("Reviewed cost preview requires a bounded, scoped past trace.")
  const pools = new Map<string, ReviewedCostTracePool>()
  for (const pool of input.pools) {
    if (
      !pool.balanceSourceId.trim() ||
      pools.has(pool.balanceSourceId) ||
      pool.tenantId !== input.tenantId ||
      pool.bookId !== input.bookId ||
      pool.currencyCode !== input.currencyCode ||
      !pool.productId.trim() ||
      !pool.variantId.trim()
    )
      conflict("Reviewed trace pool ownership or currency is inconsistent.")
    quantity(pool.expectedEndingQuantity)
    pools.set(pool.balanceSourceId, pool)
  }
  const nodes = new Map<string, ReviewedCostTraceNode>()
  const byPool = new Map<string, ReviewedCostTraceNode[]>()
  const returns = new Map<string, ReviewedCostTraceNode[]>()
  for (const node of input.nodes) {
    if (
      !node.id.trim() ||
      nodes.has(node.id) ||
      !pools.has(node.balanceSourceId) ||
      typeof node.ordinal !== "bigint" ||
      node.ordinal <= ZERO ||
      node.ordinal > MAX_MINOR ||
      !Number.isFinite(node.effectiveAt.getTime()) ||
      node.effectiveAt > input.through
    )
      conflict("Reviewed trace node identity, date or pool is inconsistent.")
    quantity(node.quantityBefore)
    quantity(node.quantityAfter)
    const q = quantity(node.quantity)
    if (node.recordedCostMinor !== null) amount(node.recordedCostMinor)
    if (
      q === "0" &&
      (node.kind !== "ORIGIN" || node.recordedCostMinor !== ZERO)
    )
      conflict("Only a real known-zero origin can have zero trace quantity.")
    nodes.set(node.id, node)
    const history = byPool.get(node.balanceSourceId) ?? []
    history.push(node)
    byPool.set(node.balanceSourceId, history)
    if ("originalIssueId" in node) {
      const related = returns.get(node.originalIssueId) ?? []
      related.push(node)
      returns.set(node.originalIssueId, related)
    }
  }
  const evidence = new Map<string, ReviewedCostEvidence>()
  for (const fact of input.evidence) {
    const origin = nodes.get(fact.eventId)
    if (
      evidence.has(fact.eventId) ||
      origin?.kind !== "ORIGIN" ||
      !fact.evidenceReference.trim() ||
      fact.evidenceReference.length > 512 ||
      (origin.recordedCostMinor === null
        ? fact.mode !== "RESOLVE_UNKNOWN"
        : fact.mode !== "CORRECT_RECORDED")
    )
      conflict(
        "Reviewed original cost requires unique origin evidence and matching mode.",
      )
    amount(fact.originalCostMinor)
    if (quantity(origin.quantity) === "0" && fact.originalCostMinor !== ZERO)
      conflict("A zero-quantity origin cannot introduce a monetary value.")
    evidence.set(fact.eventId, fact)
  }
  const parents = new Map<string, Set<string>>()
  const children = new Map<string, string[]>()
  for (const node of input.nodes) parents.set(node.id, new Set())
  function depend(node: ReviewedCostTraceNode, priorId: string) {
    const prior = nodes.get(priorId)
    if (!prior || prior.id === node.id || prior.effectiveAt > node.effectiveAt)
      conflict("Reviewed trace has a missing, reversed or self dependency.")
    parents.get(node.id)?.add(priorId)
  }
  for (const pool of input.pools) {
    const history = byPool.get(pool.balanceSourceId)
    if (!history?.length)
      conflict("Reviewed pool has no complete origin history.")
    history.sort((a, b) =>
      a.ordinal < b.ordinal ? -1 : a.ordinal > b.ordinal ? 1 : 0,
    )
    for (const [index, node] of history.entries()) {
      if (node.ordinal !== BigInt(index + 1))
        conflict("Reviewed trace has a duplicate or missing pool ordinal.")
      const prior = history[index - 1]
      if (prior) depend(node, prior.id)
    }
  }
  const transferConsumers = new Map<string, number>()
  for (const node of input.nodes) {
    if (node.kind === "TRANSFER_IN") {
      const source = nodes.get(node.sourceEventId)
      if (
        source?.kind !== "TRANSFER_OUT" ||
        source.balanceSourceId === node.balanceSourceId ||
        quantity(source.quantity) !== quantity(node.quantity)
      )
        conflict(
          "Reviewed transfer needs one equal original outgoing allocation.",
        )
      depend(node, source.id)
      transferConsumers.set(
        source.id,
        (transferConsumers.get(source.id) ?? 0) + 1,
      )
    } else if ("originalIssueId" in node) {
      const original = nodes.get(node.originalIssueId)
      if (
        original?.kind !== "WITHDRAWAL" ||
        (node.kind !== "RESTORATION" && original.purpose !== "PRODUCT_ISSUE")
      )
        conflict(
          "Reviewed return/restoration needs its original owning withdrawal.",
        )
      depend(node, original.id)
      quantity(node.originalRemainingQuantityBefore)
      if (typeof node.returnOrdinal !== "bigint" || node.returnOrdinal <= ZERO)
        conflict("Reviewed original return order is invalid.")
    }
    const sourceId =
      node.kind === "TRANSFER_IN"
        ? node.sourceEventId
        : "originalIssueId" in node
          ? node.originalIssueId
          : null
    if (sourceId) {
      const source = nodes.get(sourceId)
      const from = source ? pools.get(source.balanceSourceId) : null
      const to = pools.get(node.balanceSourceId)
      if (
        !from ||
        !to ||
        from.productId !== to.productId ||
        from.variantId !== to.variantId
      )
        conflict("Reviewed paired source changes Product or Variant ownership.")
    }
  }
  for (const node of input.nodes)
    if (node.kind === "TRANSFER_OUT" && transferConsumers.get(node.id) !== 1)
      conflict(
        "Reviewed transfer graph is incomplete or duplicates incoming value.",
      )
  for (const history of returns.values()) {
    history.sort((a, b) => {
      if (!("returnOrdinal" in a) || !("returnOrdinal" in b)) return 0
      return a.returnOrdinal < b.returnOrdinal
        ? -1
        : a.returnOrdinal > b.returnOrdinal
          ? 1
          : 0
    })
    for (const [index, node] of history.entries()) {
      if (
        !("returnOrdinal" in node) ||
        node.returnOrdinal !== BigInt(index + 1)
      )
        conflict("Reviewed original return order is incomplete or duplicated.")
      const prior = history[index - 1]
      if (prior) depend(node, prior.id)
    }
  }
  for (const [id, dependencies] of parents)
    for (const parent of dependencies) {
      const list = children.get(parent) ?? []
      list.push(id)
      children.set(parent, list)
    }
  const ready = [...nodes.keys()]
    .filter((id) => parents.get(id)?.size === 0)
    .sort()
  const states = new Map<string, CostState>()
  for (const pool of input.pools)
    states.set(pool.balanceSourceId, { quantity: "0", valueMinor: ZERO })
  const issueRemainders = new Map<string, CostState>()
  const allocations = new Map<string, Allocation>()
  const missingOrigins: string[] = []
  while (ready.length) {
    const id = ready.pop()
    const node = id ? nodes.get(id) : null
    if (!node) conflict("Reviewed trace traversal lost a source node.")
    const state = states.get(node.balanceSourceId)
    if (!state || state.quantity !== quantity(node.quantityBefore))
      conflict(
        "Reviewed trace does not retain the prior canonical stock quantity.",
      )
    const q = quantity(node.quantity)
    let after: CostState
    let cost: bigint | null
    if (node.kind === "ORIGIN" || node.kind === "TRANSFER_IN") {
      cost =
        node.kind === "ORIGIN"
          ? (evidence.get(node.id)?.originalCostMinor ?? node.recordedCostMinor)
          : (allocations.get(node.sourceEventId)?.resolvedCostMinor ?? null)
      if (node.kind === "ORIGIN" && cost === null) missingOrigins.push(node.id)
      after = {
        quantity: addQuantity(state.quantity, q),
        valueMinor: addValue(state.valueMinor, cost),
      }
    } else if (node.kind === "WITHDRAWAL" || node.kind === "TRANSFER_OUT") {
      const taken = issue(state, q)
      after = taken.after
      cost = taken.cost
      if (node.kind === "WITHDRAWAL")
        issueRemainders.set(node.id, { quantity: q, valueMinor: cost })
    } else {
      const remainder = issueRemainders.get(node.originalIssueId)
      if (
        !remainder ||
        remainder.quantity !== quantity(node.originalRemainingQuantityBefore)
      )
        conflict(
          "Reviewed return/restoration differs from its original remaining allocation.",
        )
      const returned = issue(remainder, q)
      issueRemainders.set(node.originalIssueId, returned.after)
      cost = returned.cost
      after =
        node.kind === "RETURN_NON_RESTOCK"
          ? { ...state }
          : {
              quantity: addQuantity(state.quantity, q),
              valueMinor: addValue(state.valueMinor, cost),
            }
    }
    if (after.quantity !== quantity(node.quantityAfter))
      conflict("Reviewed trace differs from its original resulting quantity.")
    allocations.set(node.id, {
      node,
      resolvedCostMinor: cost,
      recordedCostMinor: node.recordedCostMinor,
      differenceMinor:
        cost === null || node.recordedCostMinor === null
          ? null
          : cost - node.recordedCostMinor,
    })
    states.set(node.balanceSourceId, after)
    for (const child of children.get(node.id) ?? []) {
      const dependencies = parents.get(child)
      dependencies?.delete(node.id)
      if (dependencies?.size === 0) ready.push(child)
    }
  }
  if (allocations.size !== nodes.size)
    conflict("Reviewed trace contains a cyclic source dependency.")
  const poolResults = input.pools
    .map((pool) => {
      const state = states.get(pool.balanceSourceId)
      if (!state || state.quantity !== quantity(pool.expectedEndingQuantity))
        conflict("Reviewed trace does not reconcile its ending stock snapshot.")
      return { balanceSourceId: pool.balanceSourceId, ...state }
    })
    .sort((a, b) => a.balanceSourceId.localeCompare(b.balanceSourceId))
  const results = [...allocations.values()].sort((a, b) =>
    a.node.id.localeCompare(b.node.id),
  )
  const externalCostMinor = sum(
    results
      .filter((row) => row.node.kind === "ORIGIN")
      .map((row) => row.resolvedCostMinor),
  )
  const remainingInventoryCostMinor = sum(
    poolResults.map((pool) => pool.valueMinor),
  )
  const netWithdrawnCostMinor = sum(
    results.flatMap((row) => {
      if (row.node.kind === "WITHDRAWAL") return [row.resolvedCostMinor]
      if (row.node.kind === "RETURN_RESTOCK" || row.node.kind === "RESTORATION")
        return [row.resolvedCostMinor === null ? null : -row.resolvedCostMinor]
      return []
    }),
  )
  if (
    externalCostMinor !== null &&
    remainingInventoryCostMinor !== null &&
    netWithdrawnCostMinor !== null &&
    externalCostMinor !== remainingInventoryCostMinor + netWithdrawnCostMinor
  )
    conflict("Reviewed trace does not conserve original stock value.")
  return {
    algorithmVersion: TRACE_VERSION,
    /** Repository confirmation must also bind its source, journal and authority proof. */
    costTraceHash: financePayloadHash({
      algorithmVersion: TRACE_VERSION,
      tenantId: input.tenantId,
      bookId: input.bookId,
      currencyCode: input.currencyCode,
      through: input.through,
      pools: [...input.pools]
        .sort((a, b) => a.balanceSourceId.localeCompare(b.balanceSourceId))
        .map((pool) => ({
          ...pool,
          expectedEndingQuantity: quantity(pool.expectedEndingQuantity),
        })),
      nodes: [...input.nodes]
        .sort((a, b) => a.id.localeCompare(b.id))
        .map((node) => ({
          ...node,
          quantityBefore: quantity(node.quantityBefore),
          quantityAfter: quantity(node.quantityAfter),
          quantity: quantity(node.quantity),
          ...("originalIssueId" in node
            ? {
                originalRemainingQuantityBefore: quantity(
                  node.originalRemainingQuantityBefore,
                ),
              }
            : {}),
        })),
      evidence: [...input.evidence].sort((a, b) =>
        a.eventId.localeCompare(b.eventId),
      ),
    }),
    pools: poolResults,
    allocations: results,
    missingOriginEventIds: missingOrigins.sort(),
    completeCostTrace: missingOrigins.length === 0,
    externalCostMinor,
    remainingInventoryCostMinor,
    netWithdrawnCostMinor,
  }
}
