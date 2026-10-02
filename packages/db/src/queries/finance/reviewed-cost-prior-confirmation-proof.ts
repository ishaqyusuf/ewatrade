import {
  REVIEWED_COST_CONFIRMATION_CONTRACT_VERSION,
  type ReviewedCostConfirmationExpectedHeader,
  type ReviewedCostConfirmationPostingPlan,
  decodeReviewedCostConfirmationContract,
} from "./reviewed-cost-confirmation-contract"
import type { discoverReviewedCostSourcesInTransaction } from "./reviewed-cost-discovery"
import type { PriorCostReviewSnapshot } from "./reviewed-cost-prior-sources"
import { FinanceError, financePayloadHash } from "./rules"
import { normalizeQuantity } from "./valuation-math"

type Allocation = PriorCostReviewSnapshot["allocations"][number]
type Pool = PriorCostReviewSnapshot["poolSnapshots"][number]
type Review = PriorCostReviewSnapshot["reviews"][number]
type Group = ReviewedCostConfirmationPostingPlan["groups"][number]
type Discovery = Awaited<
  ReturnType<typeof discoverReviewedCostSourcesInTransaction>
>
type Book = {
  id: string
  tenantId: string
  currencyCode: string
  lastSequence: bigint
}
type Closure = Pick<
  Discovery,
  | "tenantId"
  | "bookId"
  | "currencyCode"
  | "bookSequence"
  | "balanceSourceIds"
  | "reviewAllocationIds"
  | "priorReviewIds"
  | "priorReviewPoolSnapshotIds"
>
const VERSION = "prior-cost-confirmation-row-binding-v1"
const MAX_ROWS = 4096
const MAX_MINOR = 9223372036854775807n
const MAX_SAVED_JSON_BYTES = 64 * 1024 * 1024
function conflict(message: string): never {
  throw new FinanceError("CONFLICT", `Prior review confirmation ${message}`)
}
function identity(value: string) {
  if (!value || value.trim() !== value || value.length > 256)
    conflict("identity is missing, noncanonical or excessive.")
  return value
}
function unique<T>(rows: T[], key: (row: T) => string) {
  if (rows.length > MAX_ROWS) conflict("complete row family exceeds bounds.")
  const map = new Map(rows.map((row) => [identity(key(row)), row]))
  if (map.size !== rows.length) conflict("has duplicate row identities.")
  return map
}
function exact(expected: string[], actual: string[]) {
  const a = unique(expected, (x) => x)
  const b = unique(actual, (x) => x)
  if (a.size !== b.size || [...a.keys()].some((key) => !b.has(key)))
    conflict("differs from the complete expected row manifest.")
}
function same(actual: unknown, expected: unknown, label: string) {
  if (financePayloadHash(actual) !== financePayloadHash(expected))
    conflict(`${label} differs from the saved immutable contract.`)
}
function amount(value: bigint) {
  if (typeof value !== "bigint" || value < 0n || value > MAX_MINOR)
    conflict("money/sequence exceeds exact supported bounds.")
  return value.toString()
}
function nullableAmount(value: bigint | null) {
  return value === null ? null : amount(value)
}
function instant(value: Date) {
  if (!(value instanceof Date) || !Number.isFinite(value.getTime()))
    conflict("has an invalid persisted date.")
  return value.toISOString()
}
function quantity(value: { toString(): string }) {
  try {
    return normalizeQuantity(value.toString())
  } catch {
    conflict("has an invalid persisted quantity.")
  }
}
function allocationFacts(row: Allocation) {
  return {
    id: row.id,
    tenantId: row.tenantId,
    bookId: row.bookId,
    reviewId: row.reviewId,
    poolId: row.poolId,
    balanceSourceId: row.balanceSourceId,
    sourceKey: row.sourceKey,
    kind: row.kind,
    withdrawalPurpose: row.withdrawalPurpose,
    ordinal: amount(row.ordinal),
    effectiveAt: instant(row.effectiveAt),
    quantity: quantity(row.quantity),
    quantityBefore: quantity(row.quantityBefore),
    quantityAfter: quantity(row.quantityAfter),
    recordedCostMinor: nullableAmount(row.recordedCostMinor),
    resolvedCostMinor: amount(row.resolvedCostMinor),
    valuationEventId: row.valuationEventId,
    stockOperationId: row.stockOperationId,
    stockMovementId: row.stockMovementId,
    productReturnAllocationId: row.productReturnAllocationId,
    originalSourceKey: row.originalSourceKey,
    originalRemainingQuantityBefore:
      row.originalRemainingQuantityBefore === null
        ? null
        : quantity(row.originalRemainingQuantityBefore),
    returnOrdinal:
      row.returnOrdinal === null ? null : amount(row.returnOrdinal),
    previousResolutionId: row.previousResolutionId,
  }
}
function poolFacts(row: Pool) {
  return {
    id: row.id,
    tenantId: row.tenantId,
    bookId: row.bookId,
    reviewId: row.reviewId,
    poolId: row.poolId,
    balanceSourceId: row.balanceSourceId,
    quantity: quantity(row.quantity),
    valueBeforeMinor: nullableAmount(row.valueBeforeMinor),
    valueAfterMinor: amount(row.valueAfterMinor),
    expectedStockRevision: row.expectedStockRevision,
    expectedMovementCount: amount(row.expectedMovementCount),
    expectedValuationSequence: amount(row.expectedValuationSequence),
  }
}
/** Canonical actual-row fingerprint for a future repository-derived dependency manifest. */
export function priorCostReviewAllocationFactsHash(row: Allocation) {
  return financePayloadHash({
    version: VERSION,
    documentKind: "ALLOCATION",
    facts: allocationFacts(row),
  })
}
/** Canonical actual-row fingerprint; it does not attest prior monetary acceptance. */
export function priorCostReviewPoolFactsHash(row: Pool) {
  return financePayloadHash({
    version: VERSION,
    documentKind: "POOL",
    facts: poolFacts(row),
  })
}
/** Proposed exact review-journal basis JSON; no current confirmation writer is inferred. */
export function priorCostReviewJournalBinding(reviewId: string, group: Group) {
  return {
    contractVersion: REVIEWED_COST_CONFIRMATION_CONTRACT_VERSION,
    documentKind: "REVIEW_JOURNAL_GROUP_BINDING" as const,
    reviewId: identity(reviewId),
    group,
  }
}
function byReview<T extends { reviewId: string }>(rows: T[]) {
  const result = new Map<string, T[]>()
  for (const row of rows) {
    const group = result.get(row.reviewId) ?? []
    group.push(row)
    result.set(row.reviewId, group)
  }
  return result
}
function savedArrayLength(value: unknown, key: string, expected: number) {
  if (value === null || typeof value !== "object" || !(key in value))
    conflict("untyped QA source/plan JSON has no complete row manifest.")
  const rows = (value as Record<string, unknown>)[key]
  if (!Array.isArray(rows) || rows.length !== expected)
    conflict("saved JSON count differs from actual immutable rows.")
}
function header(
  review: Review,
  book: Book,
): ReviewedCostConfirmationExpectedHeader {
  if (review.algorithmVersion !== "weighted-average-original-return-v1")
    conflict("persisted algorithm version is unsupported.")
  return {
    reviewId: review.id,
    tenantId: review.tenantId,
    bookId: review.bookId,
    currencyCode: book.currencyCode,
    actorUserId: review.actorUserId,
    clientCommandId: review.clientCommandId,
    reason: review.reason,
    reviewedBookSequence: amount(review.reviewedBookSequence),
    historyThrough: instant(review.historyThrough),
    evidenceCutoff: instant(review.evidenceCutoff),
    algorithmVersion: review.algorithmVersion,
    costTraceHash: review.costTraceHash,
    reviewedSnapshotHash: review.reviewedSnapshotHash,
  }
}

/**
 * Pure stored-contract/immutable-row binding over the repository's loaded closure.
 * Neither matched JSON/FKs nor a stored basis hash proves actual upstream owners,
 * accepted prior monetary overlays, fiscal recognition or confirmation commands.
 */
export function auditPriorCostReviewConfirmationProof(input: {
  book: Book
  prior: PriorCostReviewSnapshot
  closure: Closure
  through: Date
}) {
  const { book, prior, closure, through } = input
  identity(book.id)
  identity(book.tenantId)
  amount(book.lastSequence)
  instant(through)
  if (
    !/^[A-Z]{3}$/.test(book.currencyCode) ||
    closure.tenantId !== book.tenantId ||
    closure.bookId !== book.id ||
    closure.currencyCode !== book.currencyCode ||
    closure.bookSequence !== book.lastSequence
  )
    conflict(
      "loaded closure differs from the held Tenant/Book/currency/watermark.",
    )
  const reviews = unique(prior.reviews, (x) => x.id)
  const allocations = unique(prior.allocations, (x) => x.id)
  const pools = unique(prior.poolSnapshots, (x) => x.id)
  unique(prior.evidence, (x) => x.id)
  unique(prior.journals, (x) => x.id)
  exact(closure.priorReviewIds ?? [], [...reviews.keys()])
  exact(closure.reviewAllocationIds, [...allocations.keys()])
  exact(closure.priorReviewPoolSnapshotIds ?? [], [...pools.keys()])
  if (closure.balanceSourceIds.length > 128)
    conflict("locked pool closure exceeds bounds.")
  const balances = new Set(closure.balanceSourceIds)
  if (balances.size !== closure.balanceSourceIds.length)
    conflict("locked pool closure duplicates a balance.")
  const scope = (row: { tenantId: string; bookId: string }) => {
    if (row.tenantId !== book.tenantId || row.bookId !== book.id)
      conflict("persisted immutable row crosses held Tenant/Book.")
  }
  for (const review of reviews.values()) scope(review)
  for (const family of [
    prior.allocations,
    prior.poolSnapshots,
    prior.evidence,
    prior.journals,
  ]) {
    for (const row of family) {
      scope(row)
      if (!reviews.has(row.reviewId))
        conflict("child row has no loaded immutable header.")
      if ("balanceSourceId" in row && !balances.has(row.balanceSourceId))
        conflict("row crosses complete locked balance closure.")
    }
  }
  if (!reviews.size) {
    if (prior.evidence.length || prior.journals.length)
      conflict("unowned rows exist without a prior review.")
    return null
  }
  const byAllocation = byReview(prior.allocations)
  const byPool = byReview(prior.poolSnapshots)
  const byEvidence = byReview(prior.evidence)
  const byJournal = byReview(prior.journals)
  let jsonBytes = 0
  const jsonHash = (value: unknown) => {
    // Database Json values are already loaded. Reject excessive total saved data;
    // this is a refusal budget, never a truncated success or ownership claim.
    let serialized: string
    try {
      serialized = JSON.stringify(value)
    } catch {
      conflict("persisted basis/source/plan is not supported JSON.")
    }
    if (serialized === undefined) conflict("persisted JSON is missing.")
    jsonBytes += new TextEncoder().encode(serialized).byteLength
    if (jsonBytes > MAX_SAVED_JSON_BYTES)
      conflict("complete saved JSON exceeds the bounded byte budget.")
    try {
      return financePayloadHash(value)
    } catch {
      conflict("persisted basis/source/plan is not supported JSON.")
    }
  }
  const contracts = new Map<
    string,
    ReturnType<typeof decodeReviewedCostConfirmationContract>
  >()
  const headerFacts = []
  const evidenceFacts = []
  const journalFacts = []
  const adjustmentDescriptors: Array<{
    reviewId: string
    journalLinkId: string
    journalEntryId: string
    group: Group
  }> = []
  const adjustmentEntries = new Set<string>()
  for (const review of reviews.values()) {
    const actualAllocations = byAllocation.get(review.id) ?? []
    const actualPools = byPool.get(review.id) ?? []
    const actualEvidence = byEvidence.get(review.id) ?? []
    const actualJournals = byJournal.get(review.id) ?? []
    for (const [key, count] of [
      ["allocations", actualAllocations.length],
      ["poolSnapshots", actualPools.length],
      ["evidence", actualEvidence.length],
      ["journals", actualJournals.length],
    ] as const) {
      if (
        !Number.isSafeInteger(review._count[key]) ||
        review._count[key] !== count
      )
        conflict("header count differs from the complete loaded row family.")
    }
    if (
      !/^[a-f0-9]{64}$/.test(review.payloadHash) ||
      review.historyThrough > through ||
      review.reviewedBookSequence > book.lastSequence
    )
      conflict(
        "persisted confirmation header hash/history/watermark is invalid.",
      )
    instant(review.createdAt)
    savedArrayLength(review.sourceSnapshot, "nodes", actualAllocations.length)
    savedArrayLength(review.sourceSnapshot, "pools", actualPools.length)
    savedArrayLength(review.sourceSnapshot, "evidence", actualEvidence.length)
    savedArrayLength(
      review.postingPlan,
      "allocations",
      actualAllocations.length,
    )
    savedArrayLength(review.postingPlan, "pools", actualPools.length)
    savedArrayLength(review.postingPlan, "groups", actualJournals.length)
    const decoded = decodeReviewedCostConfirmationContract(
      {
        sourceSnapshot: review.sourceSnapshot,
        postingPlan: review.postingPlan,
        reviewedSnapshotHash: review.reviewedSnapshotHash,
      },
      header(review, book),
    )
    const sourceHash = jsonHash(review.sourceSnapshot)
    const planHash = jsonHash(review.postingPlan)
    contracts.set(review.id, decoded)
    const source = decoded.saved.sourceSnapshot
    const plan = decoded.saved.postingPlan
    const actualSources = unique(actualAllocations, (x) => x.sourceKey)
    const savedAllocations = unique(plan.allocations, (x) => x.sourceKey)
    const savedPools = unique(source.pools, (x) => x.balanceSourceId)
    exact(
      source.nodes.map((x) => x.sourceKey),
      [...actualSources.keys()],
    )
    const savedPoolValues = unique(plan.pools, (x) => x.balanceSourceId)
    for (const node of source.nodes) {
      const row = actualSources.get(node.sourceKey)
      const planned = savedAllocations.get(node.sourceKey)
      const pool = savedPools.get(node.balanceSourceId)
      if (!row || !planned || !pool)
        conflict("original allocation identity is missing.")
      same(
        allocationFacts(row),
        {
          id: row.id,
          tenantId: book.tenantId,
          bookId: book.id,
          reviewId: review.id,
          poolId: pool.poolId,
          balanceSourceId: node.balanceSourceId,
          sourceKey: node.sourceKey,
          kind: node.kind,
          withdrawalPurpose: node.withdrawalPurpose,
          ordinal: node.ordinal,
          effectiveAt: node.effectiveAt,
          quantity: node.quantity,
          quantityBefore: node.quantityBefore,
          quantityAfter: node.quantityAfter,
          recordedCostMinor: node.recordedCostMinor,
          resolvedCostMinor: planned.resolvedCostMinor,
          valuationEventId: node.valuationEventId,
          stockOperationId: node.stockOperationId,
          stockMovementId: node.stockMovementId,
          productReturnAllocationId: node.productReturnAllocationId,
          originalSourceKey: node.originalSourceKey,
          originalRemainingQuantityBefore: node.originalRemainingQuantityBefore,
          returnOrdinal: node.returnOrdinal,
          previousResolutionId: node.previousResolutionId,
        },
        "allocation original/resolved facts",
      )
      const difference =
        row.recordedCostMinor === null
          ? null
          : (row.resolvedCostMinor - row.recordedCostMinor).toString()
      if (planned.differenceMinor !== difference)
        conflict("UNKNOWN or exact original difference is changed.")
    }
    exact(
      source.pools.map((x) => x.balanceSourceId),
      actualPools.map((x) => x.balanceSourceId),
    )
    for (const row of actualPools) {
      const saved = savedPools.get(row.balanceSourceId)
      const planned = savedPoolValues.get(row.balanceSourceId)
      if (!saved || !planned) conflict("pool identity is missing.")
      same(
        poolFacts(row),
        {
          id: row.id,
          tenantId: book.tenantId,
          bookId: book.id,
          reviewId: review.id,
          poolId: saved.poolId,
          balanceSourceId: saved.balanceSourceId,
          quantity: saved.endingQuantity,
          valueBeforeMinor: saved.recordedValueMinor,
          valueAfterMinor: planned.resolvedValueMinor,
          expectedStockRevision: saved.expectedStockRevision,
          expectedMovementCount: saved.expectedMovementCount,
          expectedValuationSequence: saved.expectedValuationSequence,
        },
        "pool original/resolved projection",
      )
    }
    exact(
      source.evidence.map((x) => x.evidenceId),
      actualEvidence.map((x) => x.id),
    )
    const savedEvidence = unique(source.evidence, (x) => x.evidenceId)
    unique(actualEvidence, (x) => x.allocationId)
    for (const row of actualEvidence) {
      const saved = savedEvidence.get(row.id)
      const allocation = allocations.get(row.allocationId)
      if (
        !saved ||
        !allocation ||
        allocation.reviewId !== review.id ||
        allocation.sourceKey !== saved.sourceKey
      )
        conflict("evidence has a crossed immutable allocation binding.")
      const facts = {
        id: row.id,
        tenantId: row.tenantId,
        bookId: row.bookId,
        reviewId: row.reviewId,
        allocationId: row.allocationId,
        mode: row.mode,
        classification: row.classification,
        originalCostMinor: amount(row.originalCostMinor),
        evidenceReference: row.evidenceReference,
        sourceDocumentKind: row.sourceDocumentKind,
        sourceDocumentId: row.sourceDocumentId,
        sourceEffectiveAt: instant(row.sourceEffectiveAt),
        postingEffectiveAt: instant(row.postingEffectiveAt),
        counterAccountId: row.counterAccountId,
        billLineId: row.billLineId,
        sourceJournalEntryId: row.sourceJournalEntryId,
        basisHash: jsonHash(row.basis),
      }
      same(
        facts,
        {
          id: saved.evidenceId,
          tenantId: book.tenantId,
          bookId: book.id,
          reviewId: review.id,
          allocationId: allocation.id,
          mode: saved.mode,
          classification: saved.classification,
          originalCostMinor: saved.originalCostMinor,
          evidenceReference: saved.evidenceReference,
          sourceDocumentKind: saved.sourceDocumentKind,
          sourceDocumentId: saved.sourceDocumentId,
          sourceEffectiveAt: saved.sourceEffectiveAt,
          postingEffectiveAt: saved.postingEffectiveAt,
          counterAccountId: saved.counterAccountId,
          billLineId: saved.billLineId,
          sourceJournalEntryId: saved.sourceJournalEntryId,
          basisHash: saved.basisHash,
        },
        "evidence declared facts/basis",
      )
      evidenceFacts.push(facts)
    }
    exact(
      plan.groups.map((x) => x.groupKey),
      actualJournals.map((x) => x.groupKey),
    )
    const savedGroups = unique(plan.groups, (x) => x.groupKey)
    for (const row of actualJournals) {
      const group = savedGroups.get(row.groupKey)
      if (!group || adjustmentEntries.has(identity(row.journalEntryId)))
        conflict("adjustment journal group ownership is duplicated or missing.")
      adjustmentEntries.add(row.journalEntryId)
      const basisHash = jsonHash(row.basis)
      same(
        row.basis,
        priorCostReviewJournalBinding(review.id, group),
        "ordered review-journal group binding",
      )
      journalFacts.push({
        id: row.id,
        tenantId: row.tenantId,
        bookId: row.bookId,
        reviewId: row.reviewId,
        journalEntryId: row.journalEntryId,
        groupKey: row.groupKey,
        basisHash,
      })
      adjustmentDescriptors.push({
        reviewId: review.id,
        journalLinkId: row.id,
        journalEntryId: row.journalEntryId,
        group,
      })
    }
    headerFacts.push({
      ...header(review, book),
      payloadHash: review.payloadHash,
      createdAt: instant(review.createdAt),
      sourceHash,
      planHash,
      counts: review._count,
    })
  }
  // Only direct dependencies are decoded here. The existing topology/journal
  // primitives and repository reconciliation must independently prove acceptance.
  for (const [reviewId, decoded] of contracts) {
    const source = decoded.saved.sourceSnapshot
    for (const dependency of source.priorResolutions) {
      const row = allocations.get(dependency.resolutionId)
      const priorHeader = reviews.get(dependency.reviewId)
      if (
        !row ||
        !priorHeader ||
        !contracts.has(priorHeader.id) ||
        priorHeader.id === reviewId
      )
        conflict(
          "original prior allocation/header is outside the complete closure.",
        )
      same(
        {
          reviewId: row.reviewId,
          sourceKey: row.sourceKey,
          balanceSourceId: row.balanceSourceId,
          poolId: row.poolId,
          previousResolutionId: row.previousResolutionId,
          resolvedCostMinor: amount(row.resolvedCostMinor),
          allocationFactsHash: priorCostReviewAllocationFactsHash(row),
        },
        {
          reviewId: dependency.reviewId,
          sourceKey: dependency.sourceKey,
          balanceSourceId: dependency.balanceSourceId,
          poolId: dependency.poolId,
          previousResolutionId: dependency.previousResolutionId,
          resolvedCostMinor: dependency.resolvedCostMinor,
          allocationFactsHash: dependency.allocationFactsHash,
        },
        "prior resolved allocation dependency",
      )
      same(
        {
          contractVersion: REVIEWED_COST_CONFIRMATION_CONTRACT_VERSION,
          algorithmVersion: priorHeader.algorithmVersion,
          costTraceHash: priorHeader.costTraceHash,
          reviewedSnapshotHash: priorHeader.reviewedSnapshotHash,
        },
        {
          contractVersion: dependency.contractVersion,
          algorithmVersion: dependency.algorithmVersion,
          costTraceHash: dependency.costTraceHash,
          reviewedSnapshotHash: dependency.reviewedSnapshotHash,
        },
        "prior allocation header fingerprint",
      )
    }
    for (const dependency of source.priorPoolSnapshots) {
      const row = pools.get(dependency.snapshotId)
      const priorHeader = reviews.get(dependency.reviewId)
      if (
        !row ||
        !priorHeader ||
        !contracts.has(priorHeader.id) ||
        priorHeader.id === reviewId
      )
        conflict("original prior pool/header is outside the complete closure.")
      same(
        {
          reviewId: row.reviewId,
          balanceSourceId: row.balanceSourceId,
          poolId: row.poolId,
          quantity: quantity(row.quantity),
          valueBeforeMinor: nullableAmount(row.valueBeforeMinor),
          valueAfterMinor: amount(row.valueAfterMinor),
          poolFactsHash: priorCostReviewPoolFactsHash(row),
        },
        {
          reviewId: dependency.reviewId,
          balanceSourceId: dependency.balanceSourceId,
          poolId: dependency.poolId,
          quantity: dependency.quantity,
          valueBeforeMinor: dependency.valueBeforeMinor,
          valueAfterMinor: dependency.valueAfterMinor,
          poolFactsHash: dependency.poolFactsHash,
        },
        "prior pool pointer dependency",
      )
      same(
        {
          contractVersion: REVIEWED_COST_CONFIRMATION_CONTRACT_VERSION,
          algorithmVersion: priorHeader.algorithmVersion,
          costTraceHash: priorHeader.costTraceHash,
          reviewedSnapshotHash: priorHeader.reviewedSnapshotHash,
        },
        {
          contractVersion: dependency.contractVersion,
          algorithmVersion: dependency.algorithmVersion,
          costTraceHash: dependency.costTraceHash,
          reviewedSnapshotHash: dependency.reviewedSnapshotHash,
        },
        "prior pool header fingerprint",
      )
    }
  }
  const sort = <T>(rows: T[], key: (row: T) => string) =>
    [...rows].sort((a, b) => (key(a) < key(b) ? -1 : key(a) > key(b) ? 1 : 0))
  return {
    scope: "PRIVATE_PRIOR_COST_REVIEW_CONTRACT_ROW_BINDING" as const,
    rowBindingHash: financePayloadHash({
      version: VERSION,
      book,
      through,
      headers: sort(headerFacts, (x) => x.reviewId),
      allocations: sort(prior.allocations.map(allocationFacts), (x) => x.id),
      pools: sort(prior.poolSnapshots.map(poolFacts), (x) => x.id),
      evidence: sort(evidenceFacts, (x) => x.id),
      journals: sort(journalFacts, (x) => x.id),
    }),
    contracts: sort(
      [...contracts].map(([reviewId, decoded]) => ({ reviewId, decoded })),
      (x) => x.reviewId,
    ),
    adjustmentDescriptors: sort(adjustmentDescriptors, (x) => x.journalLinkId),
    counts: {
      reviews: reviews.size,
      allocations: allocations.size,
      pools: pools.size,
      evidence: prior.evidence.length,
      journals: prior.journals.length,
    },
    requiresOwningSourceProof: true as const,
    requiresPhysicalCompletenessProof: true as const,
    requiresEvidenceClassificationProof: true as const,
    requiresAcceptedPriorProof: true as const,
    requiresPostedJournalOwnershipProof: true as const,
    requiresConfirmationProof: true as const,
    requiresPriorReviewProof: true as const,
    requiresPriorMonetaryReconciliationProof: true as const,
    requiresImmutableConfirmationCommandProof: true as const,
  }
}
