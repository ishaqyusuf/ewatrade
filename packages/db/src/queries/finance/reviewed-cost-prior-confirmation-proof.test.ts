import { expect, test } from "bun:test"
import { Prisma } from "../../../generated/prisma/client"
import {
  type ReviewedCostConfirmationInput,
  encodeReviewedCostConfirmationContract,
} from "./reviewed-cost-confirmation-contract"
import {
  auditPriorCostReviewConfirmationProof,
  priorCostReviewAllocationFactsHash,
  priorCostReviewJournalBinding,
  priorCostReviewPoolFactsHash,
} from "./reviewed-cost-prior-confirmation-proof"
import type { PriorCostReviewSnapshot } from "./reviewed-cost-prior-sources"
import { FinanceError, financePayloadHash } from "./rules"

type Input = Parameters<typeof auditPriorCostReviewConfirmationProof>[0]
type Allocation = PriorCostReviewSnapshot["allocations"][number]
const date = "2026-10-01T12:00:00.000Z"
const cutoff = "2026-10-02T12:00:00.000Z"
const h = (value: string) => value.repeat(64)
function first<T>(rows: T[]): T {
  const row = rows[0]
  if (!row) throw new Error("Missing fixture row")
  return row
}
function contract(
  reviewId: string,
  cost = "1001",
): ReviewedCostConfirmationInput {
  const basisHash = financePayloadHash({ document: "owner-contribution", cost })
  return {
    sourceSnapshot: {
      context: {
        reviewId,
        tenantId: "tenant",
        bookId: "book",
        currencyCode: "NGN",
        actorUserId: "reviewer",
        clientCommandId: `command:${reviewId}`,
        reason: "Documented original monetary basis",
        reviewedBookSequence: "7",
        historyThrough: date,
        evidenceCutoff: cutoff,
      },
      hashes: {
        physicalSnapshotHash: h("a"),
        sourceDiscoveryHash: h("b"),
        owningSourceSnapshotHash: h("c"),
        returnSourceSnapshotHash: h("d"),
        assemblySnapshotHash: h("e"),
        repositorySourceSnapshotHash: h("f"),
      },
      pools: [
        {
          poolId: "pool",
          balanceSourceId: "balance",
          productId: "product",
          variantId: "variant",
          inventoryUnitId: "unit",
          configurationVersionId: "configuration",
          unitFactor: "1",
          stockKind: "SHARED_POOL",
          endingQuantity: "4",
          recordedValueMinor: null,
          expectedStockRevision: 1,
          expectedMovementCount: "1",
          expectedValuationSequence: "1",
          lastCostReviewSnapshotId: null,
        },
      ],
      nodes: [
        {
          sourceKey: "movement:original",
          balanceSourceId: "balance",
          kind: "ORIGIN",
          withdrawalPurpose: null,
          ordinal: "1",
          effectiveAt: date,
          quantity: "4",
          quantityBefore: "0",
          quantityAfter: "4",
          recordedCostMinor: null,
          valuationEventId: "original-event",
          stockOperationId: "original-operation",
          stockMovementId: "original",
          productReturnAllocationId: null,
          originalSourceKey: null,
          originalRemainingQuantityBefore: null,
          returnOrdinal: null,
          previousResolutionId: null,
          owner: {
            sourceKind: "INVENTORY_OPENING",
            sourceId: "original-source",
            clientCommandId: "original-command",
            payloadHash: h("a"),
            actorUserId: "original-actor",
            effectiveAt: date,
            sourceFactsHash: h("b"),
          },
        },
      ],
      evidence: [
        {
          evidenceId: `evidence:${reviewId}`,
          sourceKey: "movement:original",
          mode: "RESOLVE_UNKNOWN",
          classification: "OWNER_CONTRIBUTION",
          originalCostMinor: cost,
          evidenceReference: "approved-contribution-document",
          sourceDocumentKind: "CONTRIBUTION",
          sourceDocumentId: "contribution",
          sourceEffectiveAt: date,
          postingEffectiveAt: cutoff,
          counterAccountId: "capital",
          billLineId: null,
          sourceJournalEntryId: null,
          basisHash,
        },
      ],
      priorResolutions: [],
      priorPoolSnapshots: [],
      originalJournals: [],
      accounts: [
        {
          id: "inventory",
          bookId: "book",
          code: "1300",
          kind: "ASSET",
          purpose: "INVENTORY",
        },
        {
          id: "capital",
          bookId: "book",
          code: "3000",
          kind: "EQUITY",
          purpose: "CAPITAL",
        },
      ],
    },
    postingPlan: {
      allocations: [
        {
          sourceKey: "movement:original",
          resolvedCostMinor: cost,
          differenceMinor: null,
          classification: "OWNER_CONTRIBUTION",
          classificationBasisHash: basisHash,
          evidenceId: `evidence:${reviewId}`,
          monetaryTreatment: "PROPOSED_ADJUSTMENT",
          groupKeys: ["origin"],
          originalJournalEntryId: null,
        },
      ],
      pools: [{ balanceSourceId: "balance", resolvedValueMinor: cost }],
      groups: [
        {
          groupKey: "origin",
          allocationSourceKeys: ["movement:original"],
          evidenceIds: [`evidence:${reviewId}`],
          classifications: [
            {
              sourceKey: "movement:original",
              evidenceId: `evidence:${reviewId}`,
              classification: "OWNER_CONTRIBUTION",
              basisHash,
            },
          ],
          clientCommandId: `posting:${reviewId}`,
          sourceKind: "INVENTORY_COST_REVIEW",
          sourceId: `${reviewId}:origin`,
          actorUserId: "reviewer",
          description: "Declared contribution adjustment",
          effectiveAt: cutoff,
          storeId: null,
          reversalOfId: null,
          lines: [
            {
              accountId: "inventory",
              side: "DEBIT",
              amountMinor: cost,
              description: null,
            },
            {
              accountId: "capital",
              side: "CREDIT",
              amountMinor: cost,
              description: "Original approved basis",
            },
          ],
        },
      ],
    },
  }
}
function persisted(
  value: ReviewedCostConfirmationInput,
): PriorCostReviewSnapshot {
  const saved = encodeReviewedCostConfirmationContract(value)
  const context = saved.sourceSnapshot.context
  const allocationIds = new Map(
    saved.sourceSnapshot.nodes.map((node) => [
      node.sourceKey,
      `allocation:${context.reviewId}:${node.sourceKey}`,
    ]),
  )
  const allocations: Allocation[] = saved.sourceSnapshot.nodes.map((node) => {
    const planned = saved.postingPlan.allocations.find(
      (a) => a.sourceKey === node.sourceKey,
    )
    const pool = saved.sourceSnapshot.pools.find(
      (p) => p.balanceSourceId === node.balanceSourceId,
    )
    const id = allocationIds.get(node.sourceKey)
    if (!planned || !pool || !id) throw new Error("Missing fixture binding")
    return {
      id,
      tenantId: context.tenantId,
      bookId: context.bookId,
      reviewId: context.reviewId,
      poolId: pool.poolId,
      balanceSourceId: node.balanceSourceId,
      sourceKey: node.sourceKey,
      kind: node.kind,
      withdrawalPurpose: node.withdrawalPurpose,
      ordinal: BigInt(node.ordinal),
      effectiveAt: new Date(node.effectiveAt),
      quantity: new Prisma.Decimal(node.quantity),
      quantityBefore: new Prisma.Decimal(node.quantityBefore),
      quantityAfter: new Prisma.Decimal(node.quantityAfter),
      recordedCostMinor:
        node.recordedCostMinor === null ? null : BigInt(node.recordedCostMinor),
      resolvedCostMinor: BigInt(planned.resolvedCostMinor),
      valuationEventId: node.valuationEventId,
      stockOperationId: node.stockOperationId,
      stockMovementId: node.stockMovementId,
      productReturnAllocationId: node.productReturnAllocationId,
      originalSourceKey: node.originalSourceKey,
      originalRemainingQuantityBefore:
        node.originalRemainingQuantityBefore === null
          ? null
          : new Prisma.Decimal(node.originalRemainingQuantityBefore),
      returnOrdinal:
        node.returnOrdinal === null ? null : BigInt(node.returnOrdinal),
      previousResolutionId: node.previousResolutionId,
    }
  })
  return {
    reviews: [
      {
        id: context.reviewId,
        tenantId: context.tenantId,
        bookId: context.bookId,
        clientCommandId: context.clientCommandId,
        payloadHash: h("f"),
        costTraceHash: saved.sourceSnapshot.hashes.costTraceHash,
        reviewedSnapshotHash: saved.reviewedSnapshotHash,
        algorithmVersion: saved.sourceSnapshot.algorithmVersion,
        evidenceCutoff: new Date(context.evidenceCutoff),
        historyThrough: new Date(context.historyThrough),
        reviewedBookSequence: BigInt(context.reviewedBookSequence),
        reason: context.reason,
        sourceSnapshot: JSON.parse(JSON.stringify(saved.sourceSnapshot)),
        postingPlan: JSON.parse(JSON.stringify(saved.postingPlan)),
        actorUserId: context.actorUserId,
        createdAt: new Date(cutoff),
        _count: {
          allocations: saved.sourceSnapshot.nodes.length,
          evidence: saved.sourceSnapshot.evidence.length,
          poolSnapshots: saved.sourceSnapshot.pools.length,
          journals: saved.postingPlan.groups.length,
        },
      },
    ],
    allocations,
    poolSnapshots: saved.sourceSnapshot.pools.map((pool) => ({
      id: `snapshot:${context.reviewId}:${pool.poolId}`,
      tenantId: context.tenantId,
      bookId: context.bookId,
      reviewId: context.reviewId,
      poolId: pool.poolId,
      balanceSourceId: pool.balanceSourceId,
      quantity: new Prisma.Decimal(pool.endingQuantity),
      valueBeforeMinor:
        pool.recordedValueMinor === null
          ? null
          : BigInt(pool.recordedValueMinor),
      valueAfterMinor: BigInt(
        first(saved.postingPlan.pools).resolvedValueMinor,
      ),
      expectedStockRevision: pool.expectedStockRevision,
      expectedMovementCount: BigInt(pool.expectedMovementCount),
      expectedValuationSequence: BigInt(pool.expectedValuationSequence),
    })),
    evidence: saved.sourceSnapshot.evidence.map((e) => ({
      id: e.evidenceId,
      tenantId: context.tenantId,
      bookId: context.bookId,
      reviewId: context.reviewId,
      allocationId: allocationIds.get(e.sourceKey) ?? "missing",
      mode: e.mode,
      classification: e.classification,
      originalCostMinor: BigInt(e.originalCostMinor),
      evidenceReference: e.evidenceReference,
      sourceDocumentKind: e.sourceDocumentKind,
      sourceDocumentId: e.sourceDocumentId,
      sourceEffectiveAt: new Date(e.sourceEffectiveAt),
      postingEffectiveAt: new Date(e.postingEffectiveAt),
      counterAccountId: e.counterAccountId,
      billLineId: e.billLineId,
      sourceJournalEntryId: e.sourceJournalEntryId,
      basis: { document: "owner-contribution", cost: e.originalCostMinor },
    })),
    journals: saved.postingPlan.groups.map((group) => ({
      id: `link:${context.reviewId}:${group.groupKey}`,
      tenantId: context.tenantId,
      bookId: context.bookId,
      reviewId: context.reviewId,
      journalEntryId: `journal:${context.reviewId}:${group.groupKey}`,
      groupKey: group.groupKey,
      basis: JSON.parse(
        JSON.stringify(priorCostReviewJournalBinding(context.reviewId, group)),
      ),
    })),
  }
}
function recovered(
  kind: "RETURN_RESTOCK" | "RETURN_NON_RESTOCK" | "RESTORATION",
) {
  const value = contract("recovery")
  const original = first(value.sourceSnapshot.nodes)
  const physical = kind !== "RETURN_NON_RESTOCK"
  const productReturn = kind !== "RESTORATION"
  value.sourceSnapshot.nodes.push({
    ...original,
    sourceKey: "movement:issue",
    kind: "WITHDRAWAL",
    withdrawalPurpose: "PRODUCT_ISSUE",
    ordinal: "2",
    quantity: "1",
    quantityBefore: "4",
    quantityAfter: "3",
    valuationEventId: "issue-event",
    stockOperationId: "issue-operation",
    stockMovementId: "issue",
    owner: {
      ...original.owner,
      sourceKind: "PRODUCT_ISSUE",
      sourceId: "issue-source",
      clientCommandId: "issue-command",
    },
  })
  const sourceKey = productReturn
    ? "return-allocation:return"
    : "movement:restore"
  value.sourceSnapshot.nodes.push({
    ...original,
    sourceKey,
    kind,
    ordinal: "3",
    quantity: "1",
    quantityBefore: "3",
    quantityAfter: physical ? "4" : "3",
    valuationEventId: physical ? "return-event" : null,
    stockOperationId: physical ? "return-operation" : null,
    stockMovementId: physical ? (productReturn ? "return" : "restore") : null,
    productReturnAllocationId: productReturn ? "return" : null,
    originalSourceKey: "movement:issue",
    originalRemainingQuantityBefore: "1",
    returnOrdinal: "1",
    owner: {
      ...original.owner,
      sourceKind: productReturn ? "PRODUCT_RETURN" : "SOURCE_RESTORATION",
      sourceId: "recovered-source",
      clientCommandId: "recovered-command",
    },
  })
  for (const key of ["movement:issue", sourceKey])
    value.postingPlan.allocations.push({
      sourceKey: key,
      resolvedCostMinor: "250",
      differenceMinor: null,
      classification: "UNCLASSIFIED",
      classificationBasisHash: null,
      evidenceId: null,
      monetaryTreatment: "DEFERRED_RECOGNITION",
      groupKeys: [],
      originalJournalEntryId: null,
    })
  first(value.sourceSnapshot.pools).endingQuantity = physical ? "4" : "3"
  first(value.sourceSnapshot.pools).expectedStockRevision = physical ? 3 : 2
  first(value.sourceSnapshot.pools).expectedMovementCount = physical ? "3" : "2"
  first(value.sourceSnapshot.pools).expectedValuationSequence = physical
    ? "3"
    : "2"
  first(value.postingPlan.pools).resolvedValueMinor = physical ? "1001" : "751"
  return value
}
function input(prior = persisted(contract("first"))): Input {
  return {
    book: {
      id: "book",
      tenantId: "tenant",
      currencyCode: "NGN",
      lastSequence: 7n,
    },
    through: new Date(cutoff),
    prior,
    closure: {
      tenantId: "tenant",
      bookId: "book",
      currencyCode: "NGN",
      bookSequence: 7n,
      balanceSourceIds: ["balance"],
      reviewAllocationIds: prior.allocations.map((row) => row.id),
      priorReviewIds: prior.reviews.map((row) => row.id),
      priorReviewPoolSnapshotIds: prior.poolSnapshots.map((row) => row.id),
    },
  }
}
function chained() {
  const previous = persisted(contract("first"))
  const current = contract("second", "1002")
  const allocation = first(previous.allocations)
  const pool = first(previous.poolSnapshots)
  const review = first(previous.reviews)
  first(current.sourceSnapshot.nodes).previousResolutionId = allocation.id
  first(current.sourceSnapshot.pools).lastCostReviewSnapshotId = pool.id
  first(current.sourceSnapshot.pools).recordedValueMinor = "1001"
  const binding = {
    reviewId: review.id,
    contractVersion: "reviewed-cost-confirmation-v1" as const,
    algorithmVersion: "weighted-average-original-return-v1" as const,
    costTraceHash: review.costTraceHash,
    balanceSourceId: "balance",
    poolId: "pool",
    reviewedSnapshotHash: review.reviewedSnapshotHash,
    topologyHash: h("c"),
    journalFactsHash: h("d"),
  }
  current.sourceSnapshot.priorResolutions = [
    {
      ...binding,
      resolutionId: allocation.id,
      previousResolutionId: allocation.previousResolutionId,
      sourceKey: allocation.sourceKey,
      resolvedCostMinor: allocation.resolvedCostMinor.toString(),
      allocationFactsHash: priorCostReviewAllocationFactsHash(allocation),
    },
  ]
  current.sourceSnapshot.priorPoolSnapshots = [
    {
      ...binding,
      snapshotId: pool.id,
      quantity: pool.quantity.toString(),
      valueBeforeMinor: null,
      valueAfterMinor: pool.valueAfterMinor.toString(),
      poolFactsHash: priorCostReviewPoolFactsHash(pool),
    },
  ]
  for (const line of first(current.postingPlan.groups).lines)
    line.amountMinor = "1"
  const next = persisted(current)
  return {
    previous,
    current,
    next,
    value: input({
      reviews: [...previous.reviews, ...next.reviews],
      allocations: [...previous.allocations, ...next.allocations],
      evidence: [...previous.evidence, ...next.evidence],
      poolSnapshots: [...previous.poolSnapshots, ...next.poolSnapshots],
      journals: [...previous.journals, ...next.journals],
    }),
  }
}
function reject(operation: () => unknown, message?: string) {
  try {
    operation()
    throw new Error("Expected rejected row binding")
  } catch (error) {
    expect(error).toBeInstanceOf(FinanceError)
    if (!(error instanceof FinanceError)) throw error
    expect(error.code).toBe("CONFLICT")
    if (message) expect(error.message).toContain(message)
  }
}

test("binds every actual immutable row while preserving original UNKNOWN and exact ordered descriptors", () => {
  const value = input()
  const result = auditPriorCostReviewConfirmationProof(value)
  expect(result?.counts).toEqual({
    reviews: 1,
    allocations: 1,
    pools: 1,
    evidence: 1,
    journals: 1,
  })
  expect(result?.rowBindingHash).toMatch(/^[a-f0-9]{64}$/)
  expect(first(value.prior.allocations).recordedCostMinor).toBeNull()
  expect(
    first(result?.contracts ?? []).decoded.saved.postingPlan.allocations[0]
      ?.differenceMinor,
  ).toBeNull()
  expect(
    first(result?.adjustmentDescriptors ?? []).group.lines.map((line) => [
      line.accountId,
      line.side,
      line.amountMinor,
    ]),
  ).toEqual([
    ["inventory", "DEBIT", "1001"],
    ["capital", "CREDIT", "1001"],
  ])
})
test("matching QA declarations and stored row JSON leave every authority/proof requirement outstanding", () => {
  const result = auditPriorCostReviewConfirmationProof(input())
  expect(result?.scope).toBe("PRIVATE_PRIOR_COST_REVIEW_CONTRACT_ROW_BINDING")
  expect([
    result?.requiresOwningSourceProof,
    result?.requiresPhysicalCompletenessProof,
    result?.requiresEvidenceClassificationProof,
    result?.requiresAcceptedPriorProof,
    result?.requiresPostedJournalOwnershipProof,
    result?.requiresConfirmationProof,
    result?.requiresPriorReviewProof,
    result?.requiresPriorMonetaryReconciliationProof,
    result?.requiresImmutableConfirmationCommandProof,
  ]).toEqual(Array(9).fill(true))
})
test("complete two-header predecessor/pool closure binds original prior amounts without applying a monetary overlay", () => {
  const value = chained().value
  const result = auditPriorCostReviewConfirmationProof(value)
  expect(result?.counts.reviews).toBe(2)
  const saved = result?.contracts.find((row) => row.reviewId === "second")
    ?.decoded.saved
  expect(
    first(saved?.sourceSnapshot.priorResolutions ?? []).resolvedCostMinor,
  ).toBe("1001")
  expect(first(saved?.postingPlan.allocations ?? []).resolvedCostMinor).toBe(
    "1002",
  )
  expect(
    first(saved?.postingPlan.groups ?? []).lines.map(
      (line) => line.amountMinor,
    ),
  ).toEqual(["1", "1"])
  expect(result?.requiresPriorMonetaryReconciliationProof).toBe(true)
})
test("row binding hash is deterministic across loaded row ordering and does not mutate facts", () => {
  const value = chained().value
  const before = first(value.prior.reviews).sourceSnapshot
  const hash = auditPriorCostReviewConfirmationProof(value)?.rowBindingHash
  for (const rows of [
    value.prior.reviews,
    value.prior.allocations,
    value.prior.poolSnapshots,
    value.prior.evidence,
    value.prior.journals,
  ])
    rows.reverse()
  expect(auditPriorCostReviewConfirmationProof(value)?.rowBindingHash).toBe(
    hash,
  )
  expect(
    value.prior.reviews.find((row) => row.id === "first")?.sourceSnapshot,
  ).toEqual(before)
})
test("empty no-prior closure performs no decoding and returns null", () => {
  expect(
    auditPriorCostReviewConfirmationProof(
      input({
        reviews: [],
        allocations: [],
        poolSnapshots: [],
        evidence: [],
        journals: [],
      }),
    ),
  ).toBeNull()
})
test.each([
  "tenant",
  "book",
  "currency",
  "watermark",
  "balances",
  "duplicateBalance",
])("refuses held closure mismatch %s", (kind) => {
  const value = input()
  if (kind === "tenant") value.closure.tenantId = "other"
  if (kind === "book") value.closure.bookId = "other"
  if (kind === "currency") value.closure.currencyCode = "USD"
  if (kind === "watermark") value.closure.bookSequence = 8n
  if (kind === "balances") value.closure.balanceSourceIds = ["other"]
  if (kind === "duplicateBalance")
    value.closure.balanceSourceIds.push("balance")
  reject(() => auditPriorCostReviewConfirmationProof(value))
})
test.each([
  "reviews",
  "allocations",
  "poolSnapshots",
  "evidence",
  "journals",
] as const)("refuses missing actual family %s", (family) => {
  const value = input()
  value.prior[family] = []
  reject(() => auditPriorCostReviewConfirmationProof(value))
})
test.each([
  "reviews",
  "allocations",
  "poolSnapshots",
  "evidence",
  "journals",
] as const)("refuses duplicate actual family %s", (family) => {
  const value = input()
  const rows = value.prior[family]
  const duplicate = rows[0]
  if (!duplicate) throw new Error("Missing fixture row")
  // Corrupt the loaded fixture through an actual array operation, not production code.
  value.prior = { ...value.prior, [family]: [...rows, duplicate] }
  reject(() => auditPriorCostReviewConfirmationProof(value), "duplicate")
})
test.each([
  "reviews",
  "allocations",
  "poolSnapshots",
  "evidence",
  "journals",
] as const)("refuses crossed Tenant/Book %s", (family) => {
  const value = input()
  const row = value.prior[family][0]
  if (!row) throw new Error("Missing fixture row")
  row.bookId = "other"
  reject(() => auditPriorCostReviewConfirmationProof(value), "Tenant/Book")
})
test.each(["allocations", "poolSnapshots", "evidence", "journals"] as const)(
  "refuses unowned child %s",
  (family) => {
    const value = input()
    const row = value.prior[family][0]
    if (!row) throw new Error("Missing fixture row")
    row.reviewId = "missing"
    reject(() => auditPriorCostReviewConfirmationProof(value), "no loaded")
  },
)
test.each(["allocations", "poolSnapshots", "evidence", "journals"] as const)(
  "refuses incomplete persisted _count.%s",
  (family) => {
    const value = input()
    first(value.prior.reviews)._count[family] = 2
    reject(() => auditPriorCostReviewConfirmationProof(value), "count")
  },
)
test.each([
  "algorithm",
  "costHash",
  "reviewedHash",
  "actor",
  "command",
  "reason",
  "history",
  "cutoff",
  "sequence",
  "payload",
  "createdAt",
])("derives expected contract header from actual persisted %s", (kind) => {
  const value = input()
  const review = first(value.prior.reviews)
  if (kind === "algorithm") review.algorithmVersion = "unknown-v2"
  if (kind === "costHash") review.costTraceHash = h("e")
  if (kind === "reviewedHash") review.reviewedSnapshotHash = h("e")
  if (kind === "actor") review.actorUserId = "other"
  if (kind === "command") review.clientCommandId = "other"
  if (kind === "reason") review.reason = "Other reason"
  if (kind === "history") review.historyThrough = new Date(cutoff)
  if (kind === "cutoff") review.evidenceCutoff = new Date(date)
  if (kind === "sequence") review.reviewedBookSequence = 8n
  if (kind === "payload") review.payloadHash = "qa"
  if (kind === "createdAt") review.createdAt = new Date("invalid")
  reject(() => auditPriorCostReviewConfirmationProof(value))
})
test.each([
  null,
  {},
  { classification: "SOURCE_CORRECTION" },
  { version: "legacy", nodes: [], pools: [], evidence: [] },
])("refuses untyped QA source JSON %j", (raw) => {
  const value = input()
  first(value.prior.reviews).sourceSnapshot = JSON.parse(JSON.stringify(raw))
  reject(() => auditPriorCostReviewConfirmationProof(value))
})
test.each([{}, { groups: [] }, { groups: [{}], allocations: [], pools: [] }])(
  "refuses QA posting plan %j",
  (raw) => {
    const value = input()
    first(value.prior.reviews).postingPlan = JSON.parse(JSON.stringify(raw))
    reject(() => auditPriorCostReviewConfirmationProof(value))
  },
)
test.each(["sourceSnapshot", "postingPlan"] as const)(
  "strict decoder refuses changed %s version",
  (key) => {
    const value = input()
    const review = first(value.prior.reviews)
    const raw = JSON.parse(JSON.stringify(review[key]))
    raw.contractVersion = "unknown-v2"
    review[key] = raw
    reject(() => auditPriorCostReviewConfirmationProof(value), "shape/version")
  },
)
test.each([
  "resolved",
  "recordedZero",
  "quantity",
  "before",
  "after",
  "ordinal",
  "date",
  "kind",
  "purpose",
  "pool",
  "valuation",
  "operation",
  "movement",
  "return",
  "dependency",
  "residual",
  "returnOrdinal",
  "previous",
])("refuses changed immutable allocation %s", (kind) => {
  const value = input()
  const row = first(value.prior.allocations)
  if (kind === "resolved") row.resolvedCostMinor = 1002n
  if (kind === "recordedZero") row.recordedCostMinor = 0n
  if (kind === "quantity") row.quantity = new Prisma.Decimal("5")
  if (kind === "before") row.quantityBefore = new Prisma.Decimal("1")
  if (kind === "after") row.quantityAfter = new Prisma.Decimal("5")
  if (kind === "ordinal") row.ordinal = 2n
  if (kind === "date") row.effectiveAt = new Date(cutoff)
  if (kind === "kind") row.kind = "WITHDRAWAL"
  if (kind === "purpose") row.withdrawalPurpose = "ORDINARY"
  if (kind === "pool") row.poolId = "other"
  if (kind === "valuation") row.valuationEventId = "other"
  if (kind === "operation") row.stockOperationId = "other"
  if (kind === "movement") row.stockMovementId = "other"
  if (kind === "return") row.productReturnAllocationId = "other"
  if (kind === "dependency") row.originalSourceKey = "other"
  if (kind === "residual")
    row.originalRemainingQuantityBefore = new Prisma.Decimal("1")
  if (kind === "returnOrdinal") row.returnOrdinal = 1n
  if (kind === "previous") row.previousResolutionId = "other"
  reject(() => auditPriorCostReviewConfirmationProof(value), "allocation")
})
test.each([
  "quantity",
  "originalZero",
  "value",
  "revision",
  "movementCount",
  "valuationSequence",
  "pool",
])("refuses changed immutable pool %s", (kind) => {
  const value = input()
  const row = first(value.prior.poolSnapshots)
  if (kind === "quantity") row.quantity = new Prisma.Decimal("5")
  if (kind === "originalZero") row.valueBeforeMinor = 0n
  if (kind === "value") row.valueAfterMinor = 1002n
  if (kind === "revision") row.expectedStockRevision = 2
  if (kind === "movementCount") row.expectedMovementCount = 2n
  if (kind === "valuationSequence") row.expectedValuationSequence = 2n
  if (kind === "pool") row.poolId = "other"
  reject(() => auditPriorCostReviewConfirmationProof(value), "pool")
})
test.each([
  "allocation",
  "mode",
  "classification",
  "amount",
  "reference",
  "documentKind",
  "documentId",
  "sourceDate",
  "postingDate",
  "account",
  "bill",
  "originalJournal",
  "basis",
])("refuses changed actual evidence %s", (kind) => {
  const value = input()
  const row = first(value.prior.evidence)
  if (kind === "allocation") row.allocationId = "other"
  if (kind === "mode") row.mode = "CORRECT_RECORDED"
  if (kind === "classification") row.classification = "OPENING_BALANCE"
  if (kind === "amount") row.originalCostMinor = 1002n
  if (kind === "reference") row.evidenceReference = "other"
  if (kind === "documentKind") row.sourceDocumentKind = "other"
  if (kind === "documentId") row.sourceDocumentId = "other"
  if (kind === "sourceDate") row.sourceEffectiveAt = new Date(cutoff)
  if (kind === "postingDate") row.postingEffectiveAt = new Date(date)
  if (kind === "account") row.counterAccountId = "other"
  if (kind === "bill") row.billLineId = "other"
  if (kind === "originalJournal") row.sourceJournalEntryId = "other"
  if (kind === "basis")
    row.basis = { document: "another-document", cost: "1001" }
  reject(() => auditPriorCostReviewConfirmationProof(value), "evidence")
})
test.each([
  "missing",
  "unknownVersion",
  "extraField",
  "review",
  "group",
  "actor",
  "command",
  "source",
  "date",
  "account",
  "amount",
  "order",
  "description",
  "payloadHash",
])("refuses review journal basis %s", (kind) => {
  const value = input()
  const row = first(value.prior.journals)
  const basis = JSON.parse(JSON.stringify(row.basis))
  if (kind === "missing") row.basis = {}
  else {
    if (kind === "unknownVersion") basis.contractVersion = "unknown-v2"
    if (kind === "extraField") basis.confirmed = true
    if (kind === "review") basis.reviewId = "other"
    if (kind === "group") basis.group.groupKey = "other"
    if (kind === "actor") basis.group.actorUserId = "other"
    if (kind === "command") basis.group.clientCommandId = "other"
    if (kind === "source") basis.group.sourceId = "other"
    if (kind === "date") basis.group.effectiveAt = date
    if (kind === "account") basis.group.lines[0].accountId = "other"
    if (kind === "amount") basis.group.lines[0].amountMinor = "1002"
    if (kind === "order") basis.group.lines.reverse()
    if (kind === "description") basis.group.lines[0].description = "other"
    if (kind === "payloadHash") basis.group.postingPayloadHash = h("e")
    row.basis = basis
  }
  reject(
    () => auditPriorCostReviewConfirmationProof(value),
    "ordered review-journal",
  )
})
test("refuses a journal group link moved to another declared group", () => {
  const value = input()
  first(value.prior.journals).groupKey = "other"
  reject(() => auditPriorCostReviewConfirmationProof(value), "manifest")
})
test("one actual adjustment entry cannot be owned by two review groups", () => {
  const value = chained().value
  const next = value.prior.journals[1]
  if (!next) throw new Error("Missing next journal")
  next.journalEntryId = first(value.prior.journals).journalEntryId
  reject(() => auditPriorCostReviewConfirmationProof(value), "ownership")
})
test.each([
  "allocationAmount",
  "allocationHash",
  "poolAmount",
  "poolHash",
  "headerHash",
  "headerCostHash",
  "missingAllocationHeader",
  "missingPoolHeader",
])(
  "refuses prior dependency that disagrees with actual complete closure %s",
  (kind) => {
    const fixture = chained()
    if (kind === "allocationAmount")
      first(fixture.current.sourceSnapshot.priorResolutions).resolvedCostMinor =
        "999"
    if (kind === "allocationHash")
      first(
        fixture.current.sourceSnapshot.priorResolutions,
      ).allocationFactsHash = h("e")
    if (kind === "poolAmount")
      first(fixture.current.sourceSnapshot.priorPoolSnapshots).valueAfterMinor =
        "999"
    if (kind === "poolHash")
      first(fixture.current.sourceSnapshot.priorPoolSnapshots).poolFactsHash =
        h("e")
    if (kind === "headerHash") {
      first(
        fixture.current.sourceSnapshot.priorResolutions,
      ).reviewedSnapshotHash = h("e")
      first(
        fixture.current.sourceSnapshot.priorPoolSnapshots,
      ).reviewedSnapshotHash = h("e")
    }
    if (kind === "headerCostHash") {
      first(fixture.current.sourceSnapshot.priorResolutions).costTraceHash =
        h("e")
      first(fixture.current.sourceSnapshot.priorPoolSnapshots).costTraceHash =
        h("e")
    }
    if (kind === "missingAllocationHeader")
      first(fixture.current.sourceSnapshot.priorResolutions).reviewId =
        "missing"
    if (kind === "missingPoolHeader")
      first(fixture.current.sourceSnapshot.priorPoolSnapshots).reviewId =
        "missing"
    const next = persisted(fixture.current)
    const value = input({
      reviews: [...fixture.previous.reviews, ...next.reviews],
      allocations: [...fixture.previous.allocations, ...next.allocations],
      poolSnapshots: [...fixture.previous.poolSnapshots, ...next.poolSnapshots],
      evidence: [...fixture.previous.evidence, ...next.evidence],
      journals: [...fixture.previous.journals, ...next.journals],
    })
    reject(() => auditPriorCostReviewConfirmationProof(value))
  },
)
test("an unversioned referenced prior header cannot become accepted through a valid current contract", () => {
  const value = chained().value
  first(value.prior.reviews).sourceSnapshot = {
    classification: "OWNER_CONTRIBUTION",
    confirmed: true,
  }
  reject(() => auditPriorCostReviewConfirmationProof(value), "untyped QA")
})
test("preserves exact signed original difference for a real recorded correction", () => {
  const value = contract("correction")
  first(value.sourceSnapshot.nodes).recordedCostMinor = "1200"
  first(value.sourceSnapshot.evidence).mode = "CORRECT_RECORDED"
  first(value.postingPlan.allocations).differenceMinor = "-199"
  const result = auditPriorCostReviewConfirmationProof(input(persisted(value)))
  expect(
    first(result?.contracts ?? []).decoded.saved.postingPlan.allocations[0]
      ?.differenceMinor,
  ).toBe("-199")
})
test.each([
  "reviews",
  "allocations",
  "poolSnapshots",
  "evidence",
  "journals",
] as const)(
  "refuses overflow of complete loaded %s family before decoding",
  (family) => {
    const value = input()
    const row = value.prior[family][0]
    if (!row) throw new Error("Missing fixture row")
    value.prior = {
      ...value.prior,
      [family]: Array.from({ length: 4097 }, (_, i) => ({
        ...row,
        id: `overflow:${i}`,
      })),
    }
    reject(() => auditPriorCostReviewConfirmationProof(value), "bounds")
  },
)
test("complete saved JSON byte budget refuses oversized actual basis without a partial proof", () => {
  const value = input()
  first(value.prior.evidence).basis = { document: "x".repeat(64 * 1024 * 1024) }
  reject(() => auditPriorCostReviewConfirmationProof(value), "byte budget")
})
test("self-consistent original owner declarations remain unproved without actual repository owner facts", () => {
  const value = contract("declared-owner")
  first(value.sourceSnapshot.nodes).owner.actorUserId =
    "fabricated-original-actor"
  first(value.sourceSnapshot.nodes).owner.sourceId =
    "fabricated-original-source"
  const result = auditPriorCostReviewConfirmationProof(input(persisted(value)))
  expect(
    first(result?.contracts ?? []).decoded.saved.sourceSnapshot.nodes[0]?.owner
      .sourceId,
  ).toBe("fabricated-original-source")
  expect(result?.requiresOwningSourceProof).toBe(true)
  expect(result?.requiresConfirmationProof).toBe(true)
})
test.each(["RETURN_RESTOCK", "RETURN_NON_RESTOCK", "RESTORATION"] as const)(
  "binds actual typed %s rows and exact original recovery amounts",
  (kind) => {
    const result = auditPriorCostReviewConfirmationProof(
      input(persisted(recovered(kind))),
    )
    const saved = first(result?.contracts ?? []).decoded.saved
    const node = saved.sourceSnapshot.nodes.find((row) => row.kind === kind)
    expect(result?.counts.allocations).toBe(3)
    expect(node?.originalSourceKey).toBe("movement:issue")
    expect(node?.originalRemainingQuantityBefore).toBe("1")
    expect(
      saved.postingPlan.allocations.find(
        (row) => row.sourceKey === node?.sourceKey,
      )?.resolvedCostMinor,
    ).toBe("250")
    expect(result?.requiresPostedJournalOwnershipProof).toBe(true)
  },
)
test("actual journal entry ID remains a scoped link claim until actual journal facts and confirmation are proved", () => {
  const value = input()
  first(value.prior.journals).journalEntryId = "unproved-linked-entry"
  const result = auditPriorCostReviewConfirmationProof(value)
  expect(first(result?.adjustmentDescriptors ?? []).journalEntryId).toBe(
    "unproved-linked-entry",
  )
  expect(result?.requiresPostedJournalOwnershipProof).toBe(true)
  expect(result?.requiresImmutableConfirmationCommandProof).toBe(true)
})
test("declared topology/journal hashes remain unproved even when persisted row/header binding is complete", () => {
  const fixture = chained()
  for (const dep of [
    ...fixture.current.sourceSnapshot.priorResolutions,
    ...fixture.current.sourceSnapshot.priorPoolSnapshots,
  ]) {
    dep.topologyHash = h("e")
    dep.journalFactsHash = h("f")
  }
  const next = persisted(fixture.current)
  const value = input({
    reviews: [...fixture.previous.reviews, ...next.reviews],
    allocations: [...fixture.previous.allocations, ...next.allocations],
    poolSnapshots: [...fixture.previous.poolSnapshots, ...next.poolSnapshots],
    evidence: [...fixture.previous.evidence, ...next.evidence],
    journals: [...fixture.previous.journals, ...next.journals],
  })
  const result = auditPriorCostReviewConfirmationProof(value)
  expect(result?.requiresAcceptedPriorProof).toBe(true)
  expect(result?.requiresPostedJournalOwnershipProof).toBe(true)
  expect(result?.requiresPriorMonetaryReconciliationProof).toBe(true)
})
