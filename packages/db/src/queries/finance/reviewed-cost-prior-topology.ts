import { compareExactDecimals } from "@ewatrade/utils/exact-decimal"
import type { readReviewedCostBook } from "./reviewed-cost-book-context"
import type { discoverReviewedCostSourcesInTransaction } from "./reviewed-cost-discovery"
import type { readReviewedCostPhysicalHistoryInTransaction } from "./reviewed-cost-history"
import type { PriorCostReviewSnapshot } from "./reviewed-cost-prior-sources"
import type { readReviewedCostReturnsInTransaction } from "./reviewed-cost-returns"
import type { ReviewedCostTraceNode } from "./reviewed-cost-trace"
import { FinanceError, financePayloadHash } from "./rules"
import { normalizeQuantity } from "./valuation-math"

type Discovery = Awaited<
  ReturnType<typeof discoverReviewedCostSourcesInTransaction>
>
type Physical = Awaited<
  ReturnType<typeof readReviewedCostPhysicalHistoryInTransaction>
>
type Allocation = PriorCostReviewSnapshot["allocations"][number]
type ReturnSources = Awaited<
  ReturnType<typeof readReviewedCostReturnsInTransaction>
>
type OriginalReturnSources = Pick<ReturnSources, "returns" | "allocations"> & {
  snapshot: Pick<
    ReturnSources["snapshot"],
    "tenantId" | "bookId" | "currencyCode" | "bookSequence" | "returns"
  >
}
const MAX_ROWS = 4096
const MAX_MINOR = 9223372036854775807n
function conflict(message: string): never {
  throw new FinanceError("CONFLICT", `Prior review ${message}`)
}
function unique<T extends { id: string }>(rows: T[]) {
  const map = new Map(rows.map((row) => [row.id, row]))
  if (
    rows.length > MAX_ROWS ||
    map.size !== rows.length ||
    rows.some((row) => !row.id.trim())
  )
    conflict("has duplicate, missing or excessive identities.")
  return map
}
function exactIds(expected: string[], actual: string[]) {
  if (
    new Set(expected).size !== expected.length ||
    expected.length !== actual.length ||
    actual.some((id) => !expected.includes(id))
  )
    conflict("differs from complete discovered closure.")
}
function q(value: { toString(): string } | string) {
  try {
    return normalizeQuantity(value.toString())
  } catch {
    conflict("quantity exceeds exact bounds.")
  }
}
function minor(value: bigint | null) {
  if (
    value !== null &&
    (typeof value !== "bigint" || value < 0n || value > MAX_MINOR)
  )
    conflict("amount exceeds exact bounds.")
}
function finite(date: Date) {
  return Number.isFinite(date.getTime())
}
function originalIdentity(a: Allocation) {
  return {
    sourceKey: a.sourceKey,
    poolId: a.poolId,
    balanceSourceId: a.balanceSourceId,
    kind: a.kind,
    withdrawalPurpose: a.withdrawalPurpose,
    ordinal: a.ordinal,
    effectiveAt: a.effectiveAt,
    quantity: q(a.quantity),
    quantityBefore: q(a.quantityBefore),
    quantityAfter: q(a.quantityAfter),
    recordedCostMinor: a.recordedCostMinor,
    valuationEventId: a.valuationEventId,
    stockOperationId: a.stockOperationId,
    stockMovementId: a.stockMovementId,
    productReturnAllocationId: a.productReturnAllocationId,
    originalSourceKey: a.originalSourceKey,
    originalRemainingQuantityBefore:
      a.originalRemainingQuantityBefore === null
        ? null
        : q(a.originalRemainingQuantityBefore),
    returnOrdinal: a.returnOrdinal,
  }
}

/** Structural proof only. Optional nodes must come from repository-owned original source assembly. */
export function auditPriorCostReviewTopology(input: {
  snapshot: PriorCostReviewSnapshot
  discovery: Discovery
  physical: Physical
  book: Pick<
    Awaited<ReturnType<typeof readReviewedCostBook>>,
    "id" | "tenantId" | "currencyCode" | "lastSequence"
  >
  through: Date
  originalNodes?: ReviewedCostTraceNode[]
  originalReturns?: OriginalReturnSources
}) {
  const { snapshot, discovery, physical, book, through } = input
  const scope = (row: { tenantId: string; bookId: string }) => {
    if (row.tenantId !== book.tenantId || row.bookId !== book.id)
      conflict("crosses the held Tenant/Book.")
  }
  scope(discovery)
  scope(physical)
  if (
    discovery.currencyCode !== book.currencyCode ||
    physical.currencyCode !== book.currencyCode ||
    discovery.bookSequence !== book.lastSequence ||
    physical.bookSequence !== book.lastSequence ||
    !finite(through) ||
    physical.through.getTime() !== through.getTime()
  )
    conflict("context differs from the held snapshot.")
  const reviews = unique(snapshot.reviews)
  const allocations = unique(snapshot.allocations)
  const pools = unique(snapshot.poolSnapshots)
  unique(snapshot.evidence)
  unique(snapshot.journals)
  exactIds(discovery.reviewAllocationIds, [...allocations.keys()])
  if (discovery.priorReviewIds)
    exactIds(discovery.priorReviewIds, [...reviews.keys()])
  if (discovery.priorReviewPoolSnapshotIds)
    exactIds(discovery.priorReviewPoolSnapshotIds, [...pools.keys()])
  exactIds(
    discovery.balanceSourceIds,
    physical.balances.map((b) => b.balanceSourceId),
  )
  if (!physical.balances.length || physical.balances.length > 128)
    conflict("exceeds complete pool bounds.")
  const balances = new Map(physical.balances.map((b) => [b.balanceSourceId, b]))
  if (balances.size !== physical.balances.length)
    conflict("duplicates physical balances.")
  for (const b of physical.balances) {
    if (
      b.snapshot.id !== b.balanceSourceId ||
      b.snapshot.tenantId !== book.tenantId ||
      b.snapshot.store.tenantId !== book.tenantId ||
      b.snapshot.store.currencyCode !== book.currencyCode
    )
      conflict("physical balance crosses the exact Tenant/currency scope.")
    for (const m of b.movements) {
      if (
        m.balanceSourceId !== b.balanceSourceId ||
        m.operation.tenantId !== book.tenantId ||
        m.operation.store.tenantId !== book.tenantId ||
        m.operation.store.currencyCode !== book.currencyCode ||
        (m.valuation &&
          (m.valuation.tenantId !== book.tenantId ||
            m.valuation.bookId !== book.id ||
            m.valuation.balanceSourceId !== b.balanceSourceId ||
            m.valuation.stockMovementId !== m.id ||
            m.valuation.stockOperationId !== m.operation.id ||
            m.valuation.poolId !== b.snapshot.pool?.id))
      )
        conflict("physical movement/event crosses its exact typed bindings.")
    }
  }
  const movements = new Map(
    physical.balances.flatMap((b) =>
      b.movements.map((m) => [m.id, m] as const),
    ),
  )
  if (
    movements.size !==
    physical.balances.reduce((n, b) => n + b.movements.length, 0)
  )
    conflict("duplicates original physical movements.")
  exactIds(discovery.movementIds, [...movements.keys()])
  const incompleteReviewIds: string[] = []
  const commands = new Set<string>()
  for (const review of reviews.values()) {
    scope(review)
    if (
      !review.clientCommandId.trim() ||
      [
        review.payloadHash,
        review.costTraceHash,
        review.reviewedSnapshotHash,
      ].some((hash) => !/^[a-f0-9]{64}$/.test(hash)) ||
      !review.algorithmVersion.trim() ||
      review.algorithmVersion.trim() !== review.algorithmVersion ||
      review.algorithmVersion.length > 256 ||
      commands.has(review.clientCommandId) ||
      !finite(review.createdAt) ||
      !finite(review.historyThrough) ||
      !finite(review.evidenceCutoff) ||
      review.historyThrough > through ||
      review.reviewedBookSequence < 0n ||
      review.reviewedBookSequence > book.lastSequence
    )
      conflict("header identity, sequence or historical cutoff is invalid.")
    commands.add(review.clientCommandId)
    for (const key of [
      "allocations",
      "poolSnapshots",
      "evidence",
      "journals",
    ] as const) {
      const count = snapshot[key].filter(
        (row) => row.reviewId === review.id,
      ).length
      if (
        !Number.isSafeInteger(review._count[key]) ||
        review._count[key] !== count
      )
        conflict("header count differs from complete loaded rows.")
    }
    if (!review._count.allocations || !review._count.poolSnapshots)
      incompleteReviewIds.push(review.id)
  }
  for (const rows of [
    snapshot.allocations,
    snapshot.poolSnapshots,
    snapshot.evidence,
    snapshot.journals,
  ])
    for (const row of rows) {
      scope(row)
      if (!reviews.has(row.reviewId)) conflict("child has no scoped header.")
    }
  const poolKeys = new Set<string>()
  for (const p of pools.values()) {
    const balance = balances.get(p.balanceSourceId)
    const key = JSON.stringify([p.reviewId, p.poolId])
    if (!balance || balance.snapshot.pool?.id !== p.poolId || poolKeys.has(key))
      conflict(
        "pool snapshot is missing, duplicated or outside locked closure.",
      )
    poolKeys.add(key)
    q(p.quantity)
    minor(p.valueBeforeMinor)
    minor(p.valueAfterMinor)
    if (
      !Number.isSafeInteger(p.expectedStockRevision) ||
      p.expectedStockRevision < 0 ||
      p.expectedMovementCount < 0n ||
      p.expectedValuationSequence < 0n ||
      p.expectedStockRevision > balance.snapshot.revision ||
      p.expectedMovementCount > BigInt(balance.snapshot.movementCount) ||
      p.expectedValuationSequence > balance.snapshot.pool.lastSequence
    )
      conflict("pool snapshot exceeds original physical history.")
    const reviewedMovements = new Set(
      snapshot.allocations
        .filter(
          (a) =>
            a.reviewId === p.reviewId &&
            a.poolId === p.poolId &&
            a.stockMovementId !== null,
        )
        .map((a) => a.stockMovementId),
    )
    if (
      BigInt(reviewedMovements.size) > p.expectedMovementCount ||
      [...reviewedMovements].some(
        (id) =>
          id !== null &&
          (movements.get(id)?.valuation?.sequence ?? 0n) >
            p.expectedValuationSequence,
      )
    )
      conflict("pool snapshot omits its own original physical allocations.")
    if (
      p.expectedStockRevision === balance.snapshot.revision &&
      p.expectedMovementCount === BigInt(balance.snapshot.movementCount) &&
      p.expectedValuationSequence === balance.snapshot.pool.lastSequence &&
      q(p.quantity) !== q(balance.canonicalOnHandQuantity)
    )
      conflict("unchanged pool snapshot rewrites original physical quantity.")
    if (
      !snapshot.allocations.some(
        (a) => a.reviewId === p.reviewId && a.poolId === p.poolId,
      ) &&
      !incompleteReviewIds.includes(p.reviewId)
    )
      incompleteReviewIds.push(p.reviewId)
  }
  const sourceVersions = new Map<string, Allocation[]>()
  const reviewSources = new Map<string, Allocation>()
  const ordinals = new Set<string>()
  for (const a of allocations.values()) {
    const balance = balances.get(a.balanceSourceId)
    const key = JSON.stringify([a.reviewId, a.sourceKey])
    const ordinalKey = JSON.stringify([
      a.reviewId,
      a.balanceSourceId,
      a.ordinal.toString(),
    ])
    if (
      !balance ||
      balance.snapshot.pool?.id !== a.poolId ||
      !a.sourceKey.trim() ||
      reviewSources.has(key) ||
      ordinals.has(ordinalKey) ||
      a.ordinal <= 0n ||
      a.ordinal > MAX_MINOR ||
      !finite(a.effectiveAt) ||
      a.effectiveAt > through ||
      a.effectiveAt > (reviews.get(a.reviewId)?.historyThrough ?? through) ||
      !snapshot.poolSnapshots.some(
        (p) =>
          p.reviewId === a.reviewId &&
          p.poolId === a.poolId &&
          p.balanceSourceId === a.balanceSourceId,
      )
    )
      conflict("allocation identity, ordinal or pool closure is invalid.")
    reviewSources.set(key, a)
    ordinals.add(ordinalKey)
    minor(a.recordedCostMinor)
    minor(a.resolvedCostMinor)
    q(a.quantity)
    q(a.quantityBefore)
    q(a.quantityAfter)
    const dependent = [
      "TRANSFER_IN",
      "RETURN_RESTOCK",
      "RETURN_NON_RESTOCK",
      "RESTORATION",
    ].includes(a.kind)
    const returning = [
      "RETURN_RESTOCK",
      "RETURN_NON_RESTOCK",
      "RESTORATION",
    ].includes(a.kind)
    if (
      dependent !== (a.originalSourceKey !== null) ||
      returning !==
        (a.returnOrdinal !== null &&
          a.originalRemainingQuantityBefore !== null) ||
      (!returning &&
        (a.returnOrdinal !== null ||
          a.originalRemainingQuantityBefore !== null)) ||
      (a.kind === "WITHDRAWAL"
        ? !a.withdrawalPurpose
        : a.withdrawalPurpose !== null) ||
      (a.kind === "RETURN_RESTOCK" || a.kind === "RETURN_NON_RESTOCK") !==
        (a.productReturnAllocationId !== null)
    )
      conflict("typed optional source bindings are inconsistent.")
    if (
      a.kind === "WITHDRAWAL" &&
      ![
        "PRODUCT_ISSUE",
        "STANDALONE_COMMITMENT",
        "ORDINARY",
        "COUNT_SHORTAGE",
        "CLOSEOUT_SHORTAGE",
        "SUPPLIER_RETURN",
      ].includes(a.withdrawalPurpose ?? "")
    )
      conflict("withdrawal purpose has no supported original authority.")
    if (returning) {
      if ((a.returnOrdinal ?? 0n) <= 0n || (a.returnOrdinal ?? 0n) > MAX_MINOR)
        conflict("return ordinal is invalid.")
      q(a.originalRemainingQuantityBefore ?? "")
    }
    if (a.kind === "RETURN_NON_RESTOCK") {
      if (
        a.stockMovementId !== null ||
        a.stockOperationId !== null ||
        a.valuationEventId !== null ||
        a.sourceKey !== `return-allocation:${a.productReturnAllocationId}`
      )
        conflict("nonphysical return borrows physical bindings.")
    } else if (a.stockMovementId !== null) {
      const m = movements.get(a.stockMovementId)
      if (
        !m ||
        !m.valuation ||
        m.balanceSourceId !== a.balanceSourceId ||
        m.operation.id !== a.stockOperationId ||
        m.valuation.id !== a.valuationEventId ||
        m.valuation.poolId !== a.poolId ||
        m.valuation.tenantId !== book.tenantId ||
        m.valuation.bookId !== book.id ||
        m.operation.effectiveAt.getTime() !== a.effectiveAt.getTime() ||
        a.sourceKey !==
          (a.kind === "RETURN_RESTOCK"
            ? `return-allocation:${a.productReturnAllocationId}`
            : `movement:${m.id}`)
      )
        conflict("allocation differs from typed original physical bindings.")
      if (
        a.kind !== "RETURN_RESTOCK" &&
        (q(a.quantityBefore) !== q(m.canonicalBefore) ||
          q(a.quantityAfter) !== q(m.canonicalAfter) ||
          q(a.quantity) !== q(m.signedCanonicalEffect.replace(/^-/, "")) ||
          a.recordedCostMinor !== m.valuation.sourceCostMinor ||
          ["WITHDRAWAL", "TRANSFER_OUT"].includes(a.kind) !==
            m.signedCanonicalEffect.startsWith("-"))
      )
        conflict(
          "allocation rewrites original physical quantity or recorded cost.",
        )
    } else if (
      a.stockOperationId !== null ||
      a.valuationEventId !== null ||
      a.kind !== "ORIGIN"
    )
      conflict("physical allocation is missing its original movement.")
    const versions = sourceVersions.get(a.sourceKey) ?? []
    versions.push(a)
    sourceVersions.set(a.sourceKey, versions)
  }
  const latestResolutionIds: string[] = []
  const reviewParents = new Map(
    [...reviews.keys()].map((id) => [id, new Set<string>()]),
  )
  for (const versions of sourceVersions.values()) {
    const roots = versions.filter((a) => a.previousResolutionId === null)
    if (roots.length !== 1)
      conflict("resolution chain requires exactly one root.")
    const successors = new Map<string, Allocation>()
    const identity = financePayloadHash(
      originalIdentity(roots[0] as Allocation),
    )
    for (const a of versions) {
      if (financePayloadHash(originalIdentity(a)) !== identity)
        conflict("resolution version changes immutable original identity.")
      if (a.previousResolutionId !== null) {
        const previous = allocations.get(a.previousResolutionId)
        if (
          !previous ||
          previous.sourceKey !== a.sourceKey ||
          previous.reviewId === a.reviewId ||
          successors.has(previous.id)
        )
          conflict("resolution predecessor is missing, crossed or forked.")
        const before = reviews.get(previous.reviewId)
        const after = reviews.get(a.reviewId)
        if (
          !before ||
          !after ||
          before.reviewedBookSequence > after.reviewedBookSequence ||
          before.createdAt > after.createdAt
        )
          conflict("resolution versions are cyclic, skipped or reversed.")
        reviewParents.get(a.reviewId)?.add(previous.reviewId)
        successors.set(previous.id, a)
      }
    }
    let current = roots[0]
    const visited = new Set<string>()
    while (current) {
      if (visited.has(current.id)) conflict("resolution chain is cyclic.")
      visited.add(current.id)
      const next = successors.get(current.id)
      if (!next) latestResolutionIds.push(current.id)
      current = next
    }
    if (visited.size !== versions.length)
      conflict("resolution chain has detached or skipped versions.")
  }
  // Distinct sources can otherwise form a review-level cycle despite individually linear chains.
  const remainingReviews = new Set(reviews.keys())
  while (remainingReviews.size) {
    const ready = [...remainingReviews].filter((id) =>
      [...(reviewParents.get(id) ?? [])].every(
        (parent) => !remainingReviews.has(parent),
      ),
    )
    if (!ready.length) conflict("review predecessor topology is cyclic.")
    for (const id of ready) remainingReviews.delete(id)
  }
  const ancestors = new Map<string, Set<string>>()
  function precedes(beforeId: string, afterId: string) {
    const before = reviews.get(beforeId)
    const after = reviews.get(afterId)
    if (!before || !after) conflict("pool ordering lost a review header.")
    if (before.createdAt.getTime() !== after.createdAt.getTime())
      return before.createdAt < after.createdAt
    let known = ancestors.get(afterId)
    if (!known) {
      known = new Set<string>()
      const pending = [...(reviewParents.get(afterId) ?? [])]
      while (pending.length) {
        const id = pending.pop()
        if (!id || known.has(id)) continue
        known.add(id)
        pending.push(...(reviewParents.get(id) ?? []))
      }
      ancestors.set(afterId, known)
    }
    return known.has(beforeId)
  }
  const ambiguousPoolIds: string[] = []
  const currentPointers: Array<{ poolId: string; snapshotId: string }> = []
  for (const b of physical.balances) {
    const pool = b.snapshot.pool
    if (!pool) continue
    scope(pool)
    if (pool.balanceSourceId !== b.balanceSourceId)
      conflict("current pool physical binding differs.")
    const history = snapshot.poolSnapshots.filter((p) => p.poolId === pool.id)
    const pointer =
      pool.lastCostReviewSnapshotId === null
        ? undefined
        : pools.get(pool.lastCostReviewSnapshotId)
    if (
      pool.lastCostReviewSnapshotId !== null &&
      (!pointer ||
        pointer.poolId !== pool.id ||
        pointer.balanceSourceId !== b.balanceSourceId)
    )
      conflict("current pool pointer does not name its actual scoped snapshot.")
    if (history.length && !pointer)
      conflict("current pool pointer is missing its reviewed history.")
    if (!pointer) continue
    if (history.some((p) => precedes(pointer.reviewId, p.reviewId)))
      conflict(
        "current pool pointer does not name its actual latest scoped snapshot.",
      )
    if (
      history.some(
        (p) => p.id !== pointer.id && !precedes(p.reviewId, pointer.reviewId),
      )
    )
      ambiguousPoolIds.push(pool.id)
    currentPointers.push({ poolId: pool.id, snapshotId: pointer.id })
  }
  for (const a of allocations.values()) {
    if (a.originalSourceKey === null) continue
    const original = reviewSources.get(
      JSON.stringify([a.reviewId, a.originalSourceKey]),
    )
    const from = original ? balances.get(original.balanceSourceId) : null
    const to = balances.get(a.balanceSourceId)
    if (
      !original ||
      !from ||
      !to ||
      original.id === a.id ||
      original.effectiveAt > a.effectiveAt ||
      (original.balanceSourceId === a.balanceSourceId &&
        original.ordinal >= a.ordinal) ||
      from.snapshot.productId !== to.snapshot.productId ||
      from.snapshot.variantId !== to.snapshot.variantId ||
      (a.kind === "TRANSFER_IN"
        ? original.kind !== "TRANSFER_OUT" ||
          original.balanceSourceId === a.balanceSourceId ||
          q(original.quantity) !== q(a.quantity)
        : original.kind !== "WITHDRAWAL" ||
          original.withdrawalPurpose !==
            (a.kind === "RESTORATION" ? "ORDINARY" : "PRODUCT_ISSUE"))
    )
      conflict(
        "original dependency is missing, crossed or has incompatible authority.",
      )
    if (
      a.kind !== "TRANSFER_IN" &&
      (q(a.quantity) === "0" ||
        compareExactDecimals(
          q(a.quantity),
          q(a.originalRemainingQuantityBefore ?? ""),
        ) > 0 ||
        compareExactDecimals(
          q(a.originalRemainingQuantityBefore ?? ""),
          q(original.quantity),
        ) > 0)
    )
      conflict("return/restoration exceeds its original withdrawal budget.")
    if (a.kind === "RESTORATION") {
      const m = a.stockMovementId ? movements.get(a.stockMovementId) : null
      if (
        m?.reversalOfMovementId !== original.stockMovementId ||
        original.balanceSourceId !== a.balanceSourceId ||
        q(a.quantity) !== q(original.quantity)
      )
        conflict("restoration borrows another original withdrawal.")
    }
  }
  const requiresOriginalReturns = snapshot.allocations.some(
    (a) => a.productReturnAllocationId !== null,
  )
  if (input.originalReturns) {
    const originalReturns = input.originalReturns
    scope(originalReturns.snapshot)
    if (
      originalReturns.snapshot.currencyCode !== book.currencyCode ||
      originalReturns.snapshot.bookSequence !== book.lastSequence
    )
      conflict("original returns differ from held context.")
    const returns = unique(originalReturns.allocations)
    const headers = unique(originalReturns.returns)
    const sources = unique(originalReturns.snapshot.returns)
    for (const a of allocations.values()) {
      if (a.productReturnAllocationId === null) continue
      const returned = returns.get(a.productReturnAllocationId)
      const header = returned ? headers.get(returned.returnCostId) : null
      const source = header ? sources.get(header.productReturnId) : null
      const original = reviewSources.get(
        JSON.stringify([a.reviewId, a.originalSourceKey]),
      )
      if (!returned || !header || !source || !original)
        conflict("original return dependency is missing.")
      scope(returned)
      scope(header)
      if (
        !discovery.productReturnIds.includes(source.id) ||
        returned.orderLineId !== header.orderLineId ||
        source.orderLineId !== header.orderLineId ||
        source.disposition !== header.disposition ||
        (a.kind === "RETURN_RESTOCK") !== (header.disposition === "RESTOCK") ||
        a.recordedCostMinor !== returned.sourceCostMinor ||
        q(a.quantity) !== q(returned.canonicalQuantity) ||
        q(a.originalRemainingQuantityBefore ?? "") !==
          q(returned.remainingQuantityBefore) ||
        returned.originalIssueId !== original.valuationEventId ||
        source.effectiveAt.getTime() !== a.effectiveAt.getTime() ||
        (a.kind === "RETURN_RESTOCK"
          ? source.stockOperationId !== a.stockOperationId ||
            source.destinationBalanceSourceId !== a.balanceSourceId
          : source.stockOperationId !== null ||
            source.destinationBalanceSourceId !== null ||
            original.balanceSourceId !== a.balanceSourceId)
      )
        conflict(
          "return allocation borrows a different original issue, recovery operation or recorded cost.",
        )
    }
  }
  const originalSourceBindingsProved =
    input.originalNodes !== undefined &&
    (!requiresOriginalReturns || input.originalReturns !== undefined)
  const evidenceAllocations = new Set<string>()
  for (const e of snapshot.evidence) {
    const a = allocations.get(e.allocationId)
    if (
      !a ||
      a.reviewId !== e.reviewId ||
      evidenceAllocations.has(e.allocationId) ||
      a.kind !== "ORIGIN" ||
      (a.recordedCostMinor === null
        ? e.mode !== "RESOLVE_UNKNOWN"
        : e.mode !== "CORRECT_RECORDED")
    )
      conflict("evidence ownership or original mode is inconsistent.")
    evidenceAllocations.add(e.allocationId)
    minor(e.originalCostMinor)
  }
  const journalIds = new Set<string>()
  const groups = new Set<string>()
  for (const j of snapshot.journals) {
    const key = JSON.stringify([j.reviewId, j.groupKey])
    if (
      !j.journalEntryId.trim() ||
      !j.groupKey.trim() ||
      journalIds.has(j.journalEntryId) ||
      groups.has(key)
    )
      conflict("journal ownership is duplicated or missing.")
    journalIds.add(j.journalEntryId)
    groups.add(key)
  }
  if (input.originalNodes) {
    const nodes = unique(input.originalNodes)
    for (const a of allocations.values()) {
      const n = nodes.get(a.sourceKey)
      if (
        !n ||
        n.kind !== a.kind ||
        n.balanceSourceId !== a.balanceSourceId ||
        n.ordinal !== a.ordinal ||
        n.effectiveAt.getTime() !== a.effectiveAt.getTime() ||
        q(n.quantity) !== q(a.quantity) ||
        q(n.quantityBefore) !== q(a.quantityBefore) ||
        q(n.quantityAfter) !== q(a.quantityAfter) ||
        n.recordedCostMinor !== a.recordedCostMinor ||
        (n.kind === "WITHDRAWAL" ? n.purpose : null) !== a.withdrawalPurpose ||
        (n.kind === "TRANSFER_IN"
          ? n.sourceEventId
          : "originalIssueId" in n
            ? n.originalIssueId
            : null) !== a.originalSourceKey ||
        ("returnOrdinal" in n ? n.returnOrdinal : null) !== a.returnOrdinal ||
        ("originalRemainingQuantityBefore" in n
          ? q(n.originalRemainingQuantityBefore)
          : null) !==
          (a.originalRemainingQuantityBefore === null
            ? null
            : q(a.originalRemainingQuantityBefore))
      )
        conflict(
          "allocation differs from exact repository original dependency authority.",
        )
    }
  }
  const blockers = [
    ...incompleteReviewIds.sort().map((sourceId) => ({
      code: "INCOMPLETE_PRIOR_REVIEW" as const,
      sourceId,
    })),
    ...ambiguousPoolIds.sort().map((sourceId) => ({
      code: "PRIOR_POOL_ORDER_UNPROVED" as const,
      sourceId,
    })),
    ...(!originalSourceBindingsProved
      ? [{ code: "PRIOR_ORIGINAL_SOURCE_PROOF_REQUIRED" as const }]
      : []),
    { code: "PRIOR_FISCAL_PROOF_REQUIRED" as const },
    { code: "PRIOR_CONFIRMATION_PROOF_REQUIRED" as const },
  ]
  const proof = {
    scope: "PRIOR_COST_REVIEW_TOPOLOGY" as const,
    incompleteReviewIds,
    ambiguousPoolIds,
    latestResolutionIds: latestResolutionIds.sort(),
    currentPointers: currentPointers.sort((a, b) =>
      a.poolId.localeCompare(b.poolId),
    ),
    blockers,
    topologyComplete:
      incompleteReviewIds.length === 0 && ambiguousPoolIds.length === 0,
    originalSourceBindingsProved,
    requiresMonetaryProof: true as const,
    requiresClassificationProof: true as const,
    requiresPostedJournalProof: true as const,
    requiresConfirmationProof: true as const,
    requiresPriorReviewProof: true as const,
  }
  return {
    ...proof,
    topologySnapshotHash: financePayloadHash({
      algorithmVersion: "prior-cost-review-topology-v1",
      snapshot,
      sourceDiscoveryHash: discovery.sourceDiscoveryHash,
      physicalSnapshotHash: physical.physicalSnapshotHash,
      originalNodes: input.originalNodes ?? null,
      originalReturns: input.originalReturns ?? null,
      proof,
    }),
  }
}
