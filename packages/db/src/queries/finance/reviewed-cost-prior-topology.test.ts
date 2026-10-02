import { expect, test } from "bun:test"
import { Prisma } from "../../../generated/prisma/client"
import {
  type PriorCostReviewSnapshot,
  readPriorCostReviewSources,
} from "./reviewed-cost-prior-sources"
import { auditPriorCostReviewTopology as audit } from "./reviewed-cost-prior-topology"
import type { ReviewedCostTraceNode } from "./reviewed-cost-trace"
import { financePayloadHash } from "./rules"

type Input = Parameters<typeof audit>[0]
const at = new Date("2026-10-01T12:00:00Z")
const later = new Date("2026-10-02T12:00:00Z")
const dec = (value: string) => new Prisma.Decimal(value)
const scoped = { tenantId: "tenant", bookId: "book" }
function fixture(): Input {
  const review: PriorCostReviewSnapshot["reviews"][number] = {
    id: "r1",
    ...scoped,
    clientCommandId: "command1",
    payloadHash: "a".repeat(64),
    costTraceHash: "b".repeat(64),
    reviewedSnapshotHash: "c".repeat(64),
    algorithmVersion: "test",
    evidenceCutoff: at,
    historyThrough: at,
    reviewedBookSequence: 1n,
    reason: "QA",
    sourceSnapshot: {},
    postingPlan: {},
    actorUserId: "actor",
    createdAt: later,
    _count: { allocations: 1, poolSnapshots: 1, evidence: 0, journals: 0 },
  }
  const a: PriorCostReviewSnapshot["allocations"][number] = {
    id: "a1",
    ...scoped,
    reviewId: "r1",
    poolId: "pool",
    balanceSourceId: "balance",
    sourceKey: "movement:m1",
    kind: "ORIGIN",
    withdrawalPurpose: null,
    ordinal: 1n,
    effectiveAt: at,
    quantity: dec("4"),
    quantityBefore: dec("0"),
    quantityAfter: dec("4"),
    recordedCostMinor: null,
    resolvedCostMinor: 1001n,
    valuationEventId: "v1",
    stockOperationId: "o1",
    stockMovementId: "m1",
    productReturnAllocationId: null,
    originalSourceKey: null,
    originalRemainingQuantityBefore: null,
    returnOrdinal: null,
    previousResolutionId: null,
  }
  const p: PriorCostReviewSnapshot["poolSnapshots"][number] = {
    id: "p1",
    ...scoped,
    reviewId: "r1",
    poolId: "pool",
    balanceSourceId: "balance",
    quantity: dec("4"),
    valueBeforeMinor: null,
    valueAfterMinor: 1001n,
    expectedStockRevision: 1,
    expectedMovementCount: 1n,
    expectedValuationSequence: 1n,
  }
  const unit = {
    id: "unit",
    configurationVersionId: "version",
    productId: "product",
    factor: "1",
    stockBehavior: "CANONICAL_SHARED",
  }
  const store = { id: "store", tenantId: "tenant", currencyCode: "NGN" }
  const m: Input["physical"]["balances"][number]["movements"][number] = {
    id: "m1",
    balanceSourceId: "balance",
    configurationVersionId: "version",
    enteredInventoryUnitId: "unit",
    enteredQuantity: "4",
    transactionScaleSnapshot: 6,
    unitFactorSnapshot: "1",
    signedCanonicalEffect: "4",
    previousOnHandQuantity: "0",
    resultingOnHandQuantity: "4",
    canonicalBefore: "0",
    canonicalAfter: "4",
    reversalOfMovementId: null,
    createdAt: at,
    unit,
    operation: {
      id: "o1",
      tenantId: "tenant",
      storeId: "store",
      store,
      type: "OPENING_STOCK",
      source: "QA",
      clientOperationId: "physical-command",
      payloadHash: "physical-hash",
      actorUserId: "actor",
      effectiveAt: at,
      linkedOperationId: null,
      correctionOfOperationId: null,
    },
    valuation: {
      id: "v1",
      ...scoped,
      poolId: "pool",
      balanceSourceId: "balance",
      stockOperationId: "o1",
      stockMovementId: "m1",
      sequence: 1n,
      sourceKind: "QA",
      sourceId: "o1",
      canonicalEffect: "4",
      quantityBefore: "0",
      quantityAfter: "4",
      sourceCostMinor: null,
      effectiveAt: at,
    },
  }
  const physical: Input["physical"] = {
    scope: "REQUESTED_PHYSICAL_BALANCES",
    ...scoped,
    currencyCode: "NGN",
    bookSequence: 5n,
    through: at,
    physicalSnapshotHash: "original-physical-hash",
    requiresCostGraphClosure: true,
    balances: [
      {
        balanceSourceId: "balance",
        canonicalOnHandQuantity: "4",
        impliedBaselineQuantity: "0",
        orderedMovementIds: ["m1"],
        physicalQuantityReconciled: true,
        issues: [],
        movements: [m],
        snapshot: {
          id: "balance",
          tenantId: "tenant",
          storeId: "store",
          store,
          productId: "product",
          product: { id: "product", catalogItemId: "item", tenantId: "tenant" },
          variantId: "variant",
          variant: { id: "variant", catalogItemId: "item" },
          inventoryUnitId: "unit",
          unit,
          kind: "SHARED_POOL",
          onHandQuantity: "4",
          revision: 1,
          movementCount: 1,
          pool: {
            id: "pool",
            ...scoped,
            balanceSourceId: "balance",
            quantity: "4",
            valueMinor: 1001n,
            lastSequence: 1n,
            lastMovementCount: 1n,
            lastStockRevision: 1,
            lastCostReviewSnapshotId: "p1",
          },
        },
      },
    ],
  }
  const original: ReviewedCostTraceNode = {
    id: "movement:m1",
    balanceSourceId: "balance",
    kind: "ORIGIN",
    ordinal: 1n,
    effectiveAt: at,
    quantity: "4",
    quantityBefore: "0",
    quantityAfter: "4",
    recordedCostMinor: null,
  }
  return {
    book: {
      id: "book",
      tenantId: "tenant",
      currencyCode: "NGN",
      lastSequence: 5n,
    },
    through: at,
    physical,
    discovery: {
      ...scoped,
      currencyCode: "NGN",
      bookSequence: 5n,
      rootBalanceSourceIds: ["balance"],
      balanceSourceIds: ["balance"],
      movementIds: ["m1"],
      operationIds: ["o1"],
      transferIds: [],
      orderLineIds: [],
      productReturnIds: [],
      reviewAllocationIds: ["a1"],
      priorReviewIds: ["r1"],
      priorReviewPoolSnapshotIds: ["p1"],
      sourceDiscoveryHash: "original-discovery-hash",
      requiresOwningSourceProof: true,
      requiresMonetaryProof: true,
    },
    snapshot: {
      reviews: [review],
      allocations: [a],
      poolSnapshots: [p],
      evidence: [],
      journals: [],
    },
    originalNodes: [original],
  }
}
function first<T>(rows: T[]): T {
  const row = rows[0]
  if (!row) throw new Error("Missing QA fixture row")
  return row
}
function versions(): Input {
  const f = fixture()
  const r = first(f.snapshot.reviews)
  const a = first(f.snapshot.allocations)
  const p = first(f.snapshot.poolSnapshots)
  f.snapshot.reviews.push({
    ...r,
    id: "r2",
    clientCommandId: "command2",
    reviewedBookSequence: 2n,
  })
  f.snapshot.allocations.push({
    ...a,
    id: "a2",
    reviewId: "r2",
    previousResolutionId: "a1",
    resolvedCostMinor: 1200n,
  })
  f.snapshot.poolSnapshots.push({
    ...p,
    id: "p2",
    reviewId: "r2",
    valueBeforeMinor: 1001n,
    valueAfterMinor: 1200n,
  })
  f.discovery.reviewAllocationIds.push("a2")
  f.discovery.priorReviewIds?.push("r2")
  f.discovery.priorReviewPoolSnapshotIds?.push("p2")
  const pool = first(f.physical.balances).snapshot.pool
  if (pool) {
    pool.lastCostReviewSnapshotId = "p2"
    pool.valueMinor = 1200n
  }
  return f
}
function addVersion(f: Input, previousResolutionId: string | null) {
  const r = first(f.snapshot.reviews)
  const a = first(f.snapshot.allocations)
  const p = first(f.snapshot.poolSnapshots)
  f.snapshot.reviews.push({
    ...r,
    id: "r3",
    clientCommandId: "command3",
    reviewedBookSequence: 3n,
  })
  f.snapshot.allocations.push({
    ...a,
    id: "a3",
    reviewId: "r3",
    previousResolutionId,
  })
  f.snapshot.poolSnapshots.push({ ...p, id: "p3", reviewId: "r3" })
  f.discovery.reviewAllocationIds.push("a3")
  f.discovery.priorReviewIds?.push("r3")
  f.discovery.priorReviewPoolSnapshotIds?.push("p3")
  const pool = first(f.physical.balances).snapshot.pool
  if (pool) pool.lastCostReviewSnapshotId = "p3"
}
test("valid later review of historical source preserves UNKNOWN, original facts/hashes and fiscal blockers", () => {
  const f = fixture()
  const before = financePayloadHash(f)
  const proof = audit(f)
  expect(proof.topologyComplete).toBe(true)
  expect(proof.originalSourceBindingsProved).toBe(true)
  expect(proof.latestResolutionIds).toEqual(["a1"])
  expect(proof.currentPointers).toEqual([{ poolId: "pool", snapshotId: "p1" }])
  expect(proof.blockers.map((b) => b.code)).toEqual([
    "PRIOR_FISCAL_PROOF_REQUIRED",
    "PRIOR_CONFIRMATION_PROOF_REQUIRED",
  ])
  expect(proof.requiresPriorReviewProof).toBe(true)
  expect(first(f.snapshot.allocations).recordedCostMinor).toBeNull()
  expect(financePayloadHash(f)).toBe(before)
})
test("physical/FK topology cannot certify exact original source dependency without canonical source proof", () => {
  const f = fixture()
  f.originalNodes = undefined
  const proof = audit(f)
  expect(proof.originalSourceBindingsProved).toBe(false)
  expect(proof.blockers.map((b) => b.code)).toContain(
    "PRIOR_ORIGINAL_SOURCE_PROOF_REQUIRED",
  )
})
test("valid supersession visits all versions and reports only actual latest", () => {
  expect(audit(versions()).latestResolutionIds).toEqual(["a2"])
})
test("empty pointer header and pool snapshot stays incomplete, never monetary authority", () => {
  const f = fixture()
  f.snapshot.allocations = []
  f.discovery.reviewAllocationIds = []
  first(f.snapshot.reviews)._count.allocations = 0
  const proof = audit(f)
  expect(proof.topologyComplete).toBe(false)
  expect(proof.incompleteReviewIds).toEqual(["r1"])
  expect(proof.blockers.map((b) => b.code)).toContain("INCOMPLETE_PRIOR_REVIEW")
  expect(proof.requiresConfirmationProof).toBe(true)
})
const corruptions: Array<[string, (f: Input) => void]> = [
  [
    "foreign discovery",
    (f) => {
      f.discovery.tenantId = "other"
    },
  ],
  [
    "foreign physical",
    (f) => {
      f.physical.bookId = "other"
    },
  ],
  [
    "foreign review",
    (f) => {
      first(f.snapshot.reviews).tenantId = "other"
    },
  ],
  [
    "foreign allocation",
    (f) => {
      first(f.snapshot.allocations).bookId = "other"
    },
  ],
  [
    "foreign pool",
    (f) => {
      first(f.snapshot.poolSnapshots).tenantId = "other"
    },
  ],
  [
    "foreign current pool",
    (f) => {
      const p = first(f.physical.balances).snapshot.pool
      if (p) p.bookId = "other"
    },
  ],
  [
    "wrong held sequence",
    (f) => {
      f.discovery.bookSequence = 4n
    },
  ],
  [
    "wrong currency",
    (f) => {
      f.physical.currencyCode = "USD"
    },
  ],
  [
    "missing header",
    (f) => {
      f.snapshot.reviews = []
    },
  ],
  [
    "missing allocation sibling",
    (f) => {
      first(f.snapshot.reviews)._count.allocations = 2
    },
  ],
  [
    "missing evidence sibling",
    (f) => {
      first(f.snapshot.reviews)._count.evidence = 1
    },
  ],
  [
    "missing journal sibling",
    (f) => {
      first(f.snapshot.reviews)._count.journals = 1
    },
  ],
  [
    "missing header pool",
    (f) => {
      first(f.snapshot.reviews)._count.poolSnapshots = 2
    },
  ],
  [
    "missing discovery allocation",
    (f) => {
      f.discovery.reviewAllocationIds = []
    },
  ],
  [
    "missing discovery pool",
    (f) => {
      f.discovery.priorReviewPoolSnapshotIds = []
    },
  ],
  [
    "unlocked sibling pool",
    (f) => {
      first(f.snapshot.poolSnapshots).balanceSourceId = "unlocked"
    },
  ],
  [
    "missing discovery balance",
    (f) => {
      f.discovery.balanceSourceIds = []
    },
  ],
  [
    "missing discovery movement",
    (f) => {
      f.discovery.movementIds = []
    },
  ],
  [
    "duplicate allocation",
    (f) => {
      f.snapshot.allocations.push(first(f.snapshot.allocations))
    },
  ],
  [
    "duplicate pool",
    (f) => {
      f.snapshot.poolSnapshots.push(first(f.snapshot.poolSnapshots))
    },
  ],
  [
    "future node",
    (f) => {
      first(f.snapshot.allocations).effectiveAt = later
    },
  ],
  [
    "invalid header date",
    (f) => {
      first(f.snapshot.reviews).createdAt = new Date(Number.NaN)
    },
  ],
  [
    "wrong physical pool",
    (f) => {
      first(f.snapshot.allocations).poolId = "other"
    },
  ],
  [
    "wrong original movement",
    (f) => {
      first(f.snapshot.allocations).stockMovementId = "other"
    },
  ],
  [
    "wrong original operation",
    (f) => {
      first(f.snapshot.allocations).stockOperationId = "other"
    },
  ],
  [
    "wrong valuation event",
    (f) => {
      first(f.snapshot.allocations).valuationEventId = "other"
    },
  ],
  [
    "rewritten original quantity",
    (f) => {
      first(f.snapshot.allocations).quantity = dec("3")
    },
  ],
  [
    "UNKNOWN became zero",
    (f) => {
      first(f.snapshot.allocations).recordedCostMinor = 0n
    },
  ],
  [
    "physical origin claims withdrawal",
    (f) => {
      const a = first(f.snapshot.allocations)
      a.kind = "WITHDRAWAL"
      a.withdrawalPurpose = "ORDINARY"
    },
  ],
  [
    "invented dependency",
    (f) => {
      first(f.snapshot.allocations).originalSourceKey = "movement:invented"
    },
  ],
  [
    "missing original movement binding",
    (f) => {
      first(f.snapshot.allocations).stockMovementId = null
    },
  ],
  [
    "missing current pointer",
    (f) => {
      const p = first(f.physical.balances).snapshot.pool
      if (p) p.lastCostReviewSnapshotId = null
    },
  ],
  [
    "wrong current pointer",
    (f) => {
      const p = first(f.physical.balances).snapshot.pool
      if (p) p.lastCostReviewSnapshotId = "other"
    },
  ],
  [
    "impossible stock revision",
    (f) => {
      first(f.snapshot.poolSnapshots).expectedStockRevision = 2
    },
  ],
  [
    "impossible movement count",
    (f) => {
      first(f.snapshot.poolSnapshots).expectedMovementCount = 2n
    },
  ],
  [
    "impossible physical sequence",
    (f) => {
      first(f.snapshot.poolSnapshots).expectedValuationSequence = 2n
    },
  ],
  [
    "negative resolved value",
    (f) => {
      first(f.snapshot.allocations).resolvedCostMinor = -1n
    },
  ],
  [
    "canonical dependency mismatch",
    (f) => {
      first(f.originalNodes ?? []).ordinal = 2n
    },
  ],
]
for (const [label, corrupt] of corruptions)
  test(`rejects ${label}`, () => {
    const f = fixture()
    corrupt(f)
    expect(() => audit(f)).toThrow("Prior review")
  })
const chainCorruptions: Array<[string, (f: Input) => void]> = [
  [
    "two first resolutions",
    (f) => {
      const a = f.snapshot.allocations[1]
      if (a) a.previousResolutionId = null
    },
  ],
  [
    "missing predecessor",
    (f) => {
      const a = f.snapshot.allocations[1]
      if (a) a.previousResolutionId = "missing"
    },
  ],
  [
    "self cycle",
    (f) => {
      const a = f.snapshot.allocations[1]
      if (a) a.previousResolutionId = "a2"
    },
  ],
  [
    "cycle without root",
    (f) => {
      first(f.snapshot.allocations).previousResolutionId = "a2"
    },
  ],
  [
    "fork",
    (f) => {
      addVersion(f, "a1")
    },
  ],
  [
    "skipped loaded version",
    (f) => {
      addVersion(f, "a1")
      const a = f.snapshot.allocations[1]
      if (a) a.previousResolutionId = "a3"
    },
  ],
  [
    "immutable source change",
    (f) => {
      const a = f.snapshot.allocations[1]
      if (a) a.stockMovementId = "missing"
    },
  ],
  [
    "recorded amount changed",
    (f) => {
      const a = f.snapshot.allocations[1]
      if (a) a.recordedCostMinor = 0n
    },
  ],
  [
    "reversed book sequence",
    (f) => {
      const r = f.snapshot.reviews[1]
      if (r) r.reviewedBookSequence = 0n
    },
  ],
  [
    "reversed recorded date",
    (f) => {
      const r = f.snapshot.reviews[1]
      if (r) r.createdAt = at
    },
  ],
  [
    "stale current pointer",
    (f) => {
      const p = first(f.physical.balances).snapshot.pool
      if (p) p.lastCostReviewSnapshotId = "p1"
    },
  ],
]
for (const [label, corrupt] of chainCorruptions)
  test(`rejects ${label}`, () => {
    const f = versions()
    corrupt(f)
    expect(() => audit(f)).toThrow("Prior review")
  })
function loaderFixture(f = fixture()) {
  const calls: Array<{ kind: string; args: unknown }> = []
  const findMany = (kind: string, rows: unknown[]) => async (args: unknown) => {
    calls.push({ kind, args })
    return rows
  }
  const tx = {
    $queryRaw: async () => [{ id: "book" }],
    membership: {
      findFirst: async () => ({
        tenant: {
          id: "tenant",
          currencyCode: "NGN",
          timezone: "Africa/Lagos",
          isActive: true,
        },
      }),
    },
    financeBook: { findUniqueOrThrow: async () => f.book },
    financeInventoryCostReviewAllocation: {
      findMany: findMany("allocations", f.snapshot.allocations),
    },
    financeInventoryCostReviewPool: {
      findMany: findMany("pools", f.snapshot.poolSnapshots),
    },
    financeInventoryCostReview: {
      findMany: findMany("headers", f.snapshot.reviews),
    },
    financeInventoryCostReviewEvidence: {
      findMany: findMany("evidence", f.snapshot.evidence),
    },
    financeInventoryCostReviewJournal: {
      findMany: findMany("journals", f.snapshot.journals),
    },
  } as unknown as Prisma.TransactionClient
  return { f, tx, calls }
}
const actor = {
  tenantId: "tenant",
  actorUserId: "actor",
  bookId: "book",
  through: at,
}
test("no-prior loader issues no queries or permission/context reads", async () => {
  const f = fixture()
  f.discovery.reviewAllocationIds = []
  f.discovery.priorReviewIds = undefined
  f.discovery.priorReviewPoolSnapshotIds = undefined
  const pool = first(f.physical.balances).snapshot.pool
  if (pool) pool.lastCostReviewSnapshotId = null
  const tx = new Proxy(
    {},
    {
      get() {
        throw new Error("No-prior loader must not access transaction")
      },
    },
  ) as Prisma.TransactionClient
  expect(
    await readPriorCostReviewSources(tx, actor, f.discovery, f.physical),
  ).toBeNull()
})
test("bounded loader retains original immutable rows and exposes exact-source/fiscal/confirmation blockers", async () => {
  const { f, tx, calls } = loaderFixture()
  const result = await readPriorCostReviewSources(
    tx,
    actor,
    f.discovery,
    f.physical,
  )
  expect(result?.snapshot.allocations).toBe(f.snapshot.allocations)
  expect(result?.proof.requiresPriorReviewProof).toBe(true)
  expect(result?.proof.originalSourceBindingsProved).toBe(false)
  expect(calls.map((c) => c.kind)).toEqual([
    "allocations",
    "pools",
    "headers",
    "pools",
    "evidence",
    "journals",
  ])
  expect(calls.every((c) => JSON.stringify(c.args).includes('"take":'))).toBe(
    true,
  )
})
test("pointer-only loader loads empty header and retains its incompleteness", async () => {
  const f = fixture()
  f.snapshot.allocations = []
  f.discovery.reviewAllocationIds = []
  first(f.snapshot.reviews)._count.allocations = 0
  const { tx } = loaderFixture(f)
  const result = await readPriorCostReviewSources(
    tx,
    actor,
    f.discovery,
    f.physical,
  )
  expect(result?.proof.incompleteReviewIds).toEqual(["r1"])
  expect(result?.proof.topologyComplete).toBe(false)
})
test("loader rejects incomplete allocation query rather than trusting truncated scope", async () => {
  const f = fixture()
  const { tx } = loaderFixture(f)
  f.discovery.reviewAllocationIds.push("missing")
  await expect(
    readPriorCostReviewSources(tx, actor, f.discovery, f.physical),
  ).rejects.toThrow("allocations differs")
})
test("loader rejects complete-header count that reveals an undiscovered sibling", async () => {
  const { f, tx } = loaderFixture()
  first(f.snapshot.reviews)._count.allocations = 2
  await expect(
    readPriorCostReviewSources(tx, actor, f.discovery, f.physical),
  ).rejects.toThrow("header count")
})
test("loader rejects missing current pool pointer row", async () => {
  const f = fixture()
  const p = first(f.physical.balances).snapshot.pool
  if (p) p.lastCostReviewSnapshotId = "missing"
  const { tx } = loaderFixture(f)
  await expect(
    readPriorCostReviewSources(tx, actor, f.discovery, f.physical),
  ).rejects.toThrow("pool pointers differs")
})
test("same-journal-watermark supersession is valid even with equal recorded timestamps", () => {
  const f = versions()
  const r = f.snapshot.reviews[1]
  if (r) r.reviewedBookSequence = 1n
  expect(audit(f).topologyComplete).toBe(true)
  expect(audit(f).latestResolutionIds).toEqual(["a2"])
})
test("equal journal watermarks without authoritative pool order remain explicitly blocked", () => {
  const f = fixture()
  const r = first(f.snapshot.reviews)
  const p = first(f.snapshot.poolSnapshots)
  f.snapshot.reviews.push({
    ...r,
    id: "r2",
    clientCommandId: "command2",
    _count: { allocations: 0, poolSnapshots: 1, evidence: 0, journals: 0 },
  })
  f.snapshot.poolSnapshots.push({ ...p, id: "p2", reviewId: "r2" })
  f.discovery.priorReviewIds?.push("r2")
  f.discovery.priorReviewPoolSnapshotIds?.push("p2")
  const proof = audit(f)
  expect(proof.topologyComplete).toBe(false)
  expect(proof.ambiguousPoolIds).toEqual(["pool"])
  expect(proof.blockers.map((b) => b.code)).toContain(
    "PRIOR_POOL_ORDER_UNPROVED",
  )
})
for (const field of [
  "payloadHash",
  "costTraceHash",
  "reviewedSnapshotHash",
  "algorithmVersion",
] as const)
  test(`rejects invalid header ${field} identity`, () => {
    const f = fixture()
    first(f.snapshot.reviews)[field] = " "
    expect(() => audit(f)).toThrow("header identity")
  })
function restorationFixture(): Input {
  const f = fixture()
  const base = first(f.snapshot.allocations)
  const balance = first(f.physical.balances)
  const original = first(balance.movements)
  if (!original.valuation) throw new Error("Missing QA original valuation")
  for (const [index, before, after, effect] of [
    [2, "4", "3", "-1"],
    [3, "3", "4", "1"],
  ] as const) {
    const id = `m${index}`
    const op = `o${index}`
    const event = `v${index}`
    const restoring = index === 3
    balance.movements.push({
      ...original,
      id,
      previousOnHandQuantity: before,
      resultingOnHandQuantity: after,
      canonicalBefore: before,
      canonicalAfter: after,
      signedCanonicalEffect: effect,
      reversalOfMovementId: restoring ? "m2" : null,
      operation: { ...original.operation, id: op, type: "ADJUSTMENT" },
      valuation: {
        ...original.valuation,
        id: event,
        stockMovementId: id,
        stockOperationId: op,
        sequence: BigInt(index),
        canonicalEffect: effect,
        quantityBefore: before,
        quantityAfter: after,
      },
    })
    f.snapshot.allocations.push({
      ...base,
      id: `a${index}`,
      sourceKey: `movement:${id}`,
      kind: restoring ? "RESTORATION" : "WITHDRAWAL",
      withdrawalPurpose: restoring ? null : "ORDINARY",
      ordinal: BigInt(index),
      quantity: dec("1"),
      quantityBefore: dec(before),
      quantityAfter: dec(after),
      stockMovementId: id,
      stockOperationId: op,
      valuationEventId: event,
      originalSourceKey: restoring ? "movement:m2" : null,
      returnOrdinal: restoring ? 1n : null,
      originalRemainingQuantityBefore: restoring ? dec("1") : null,
    })
    f.discovery.reviewAllocationIds.push(`a${index}`)
    f.discovery.movementIds.push(id)
    f.discovery.operationIds.push(op)
    f.originalNodes?.push(
      restoring
        ? {
            id: `movement:${id}`,
            kind: "RESTORATION",
            balanceSourceId: "balance",
            ordinal: 3n,
            effectiveAt: at,
            quantity: "1",
            quantityBefore: before,
            quantityAfter: after,
            recordedCostMinor: null,
            originalIssueId: "movement:m2",
            returnOrdinal: 1n,
            originalRemainingQuantityBefore: "1",
          }
        : {
            id: `movement:${id}`,
            kind: "WITHDRAWAL",
            purpose: "ORDINARY",
            balanceSourceId: "balance",
            ordinal: 2n,
            effectiveAt: at,
            quantity: "1",
            quantityBefore: before,
            quantityAfter: after,
            recordedCostMinor: null,
          },
    )
  }
  first(f.snapshot.reviews)._count.allocations = 3
  balance.snapshot.movementCount = 3
  balance.snapshot.revision = 3
  if (balance.snapshot.pool) {
    balance.snapshot.pool.lastSequence = 3n
    balance.snapshot.pool.lastMovementCount = 3n
    balance.snapshot.pool.lastStockRevision = 3
  }
  const p = first(f.snapshot.poolSnapshots)
  p.expectedMovementCount = 3n
  p.expectedStockRevision = 3
  p.expectedValuationSequence = 3n
  return f
}
test("exact ordinary restoration binds its actual original withdrawal", () => {
  expect(audit(restorationFixture()).originalSourceBindingsProved).toBe(true)
})
test("restoration cannot borrow a different valid physical origin", () => {
  const f = restorationFixture()
  const a = f.snapshot.allocations[2]
  if (a) a.originalSourceKey = "movement:m1"
  expect(() => audit(f)).toThrow("original dependency")
})
test("return ordinal cannot exceed database minor bound", () => {
  const f = restorationFixture()
  const a = f.snapshot.allocations[2]
  if (a) a.returnOrdinal = 9223372036854775808n
  expect(() => audit(f)).toThrow("return ordinal")
})
test("restoration cannot borrow a different original movement reversal", () => {
  const f = restorationFixture()
  const m = first(f.physical.balances).movements[2]
  if (m) m.reversalOfMovementId = "m1"
  expect(() => audit(f)).toThrow("restoration borrows")
})
test("restoration residual budget remains bound to original physical source", () => {
  const f = restorationFixture()
  const a = f.snapshot.allocations[2]
  if (a) a.originalRemainingQuantityBefore = dec("2")
  expect(() => audit(f)).toThrow("withdrawal budget")
})
test("original source proof catches valid physical restoration with wrong canonical original dependency", () => {
  const f = restorationFixture()
  const n = f.originalNodes?.[2]
  if (n && "originalIssueId" in n) n.originalIssueId = "movement:m1"
  expect(() => audit(f)).toThrow("exact repository original dependency")
})
function evidenceFixture(): Input {
  const f = fixture()
  first(f.snapshot.reviews)._count.evidence = 1
  first(f.snapshot.reviews)._count.journals = 1
  f.snapshot.evidence.push({
    id: "evidence",
    ...scoped,
    reviewId: "r1",
    allocationId: "a1",
    mode: "RESOLVE_UNKNOWN",
    classification: "OPENING_BALANCE",
    originalCostMinor: 1001n,
    evidenceReference: "QA_EVIDENCE",
    sourceDocumentKind: "QA_DOCUMENT",
    sourceDocumentId: null,
    sourceEffectiveAt: at,
    postingEffectiveAt: at,
    counterAccountId: "unproved-account",
    billLineId: null,
    sourceJournalEntryId: "unproved-source-journal",
    basis: {},
  })
  f.snapshot.journals.push({
    id: "journal-link",
    ...scoped,
    reviewId: "r1",
    journalEntryId: "unproved-adjustment-journal",
    groupKey: "opening",
    basis: {},
  })
  return f
}
test("valid scoped evidence and journal links still require actual classification, journal state and confirmation proof", () => {
  const proof = audit(evidenceFixture())
  expect(proof.topologyComplete).toBe(true)
  expect(proof.requiresClassificationProof).toBe(true)
  expect(proof.requiresPostedJournalProof).toBe(true)
  expect(proof.requiresConfirmationProof).toBe(true)
  expect(proof.blockers.map((b) => b.code)).toContain(
    "PRIOR_FISCAL_PROOF_REQUIRED",
  )
})
for (const [field, value] of [
  ["tenantId", "other"],
  ["reviewId", "missing"],
  ["allocationId", "missing"],
  ["mode", "CORRECT_RECORDED"],
] as const)
  test(`rejects crossed evidence ${field}`, () => {
    const f = evidenceFixture()
    const e = first(f.snapshot.evidence)
    if (field === "mode") e.mode = value
    else e[field] = value
    expect(() => audit(f)).toThrow("Prior review")
  })
test("duplicate original evidence cannot certify a review", () => {
  const f = evidenceFixture()
  f.snapshot.evidence.push({ ...first(f.snapshot.evidence), id: "evidence2" })
  first(f.snapshot.reviews)._count.evidence = 2
  expect(() => audit(f)).toThrow("evidence ownership")
})
for (const field of ["journalEntryId", "groupKey"] as const)
  test(`rejects duplicate review journal ${field}`, () => {
    const f = evidenceFixture()
    const j = first(f.snapshot.journals)
    f.snapshot.journals.push({
      ...j,
      id: "link2",
      journalEntryId:
        field === "journalEntryId" ? j.journalEntryId : "different",
      groupKey: field === "groupKey" ? j.groupKey : "different",
    })
    first(f.snapshot.reviews)._count.journals = 2
    expect(() => audit(f)).toThrow("journal ownership")
  })
test("bounded topology rejects allocation overflow before using partial closure", () => {
  const f = fixture()
  const a = first(f.snapshot.allocations)
  f.snapshot.allocations = Array.from({ length: 4097 }, (_, i) => ({
    ...a,
    id: `a${i}`,
  }))
  expect(() => audit(f)).toThrow("excessive identities")
})
function restockFixture(): Input {
  const f = restorationFixture()
  const withdrawal = f.snapshot.allocations[1]
  const a = f.snapshot.allocations[2]
  const n = f.originalNodes?.[2]
  const w = f.originalNodes?.[1]
  const m = first(f.physical.balances).movements[2]
  if (!withdrawal || !a || !n || !w || !m)
    throw new Error("Missing QA return records")
  withdrawal.withdrawalPurpose = "PRODUCT_ISSUE"
  if (w.kind === "WITHDRAWAL") w.purpose = "PRODUCT_ISSUE"
  a.kind = "RETURN_RESTOCK"
  a.sourceKey = "return-allocation:ra1"
  a.productReturnAllocationId = "ra1"
  n.id = a.sourceKey
  if (n.kind === "RESTORATION") n.kind = "RETURN_RESTOCK"
  m.reversalOfMovementId = null
  f.discovery.productReturnIds = ["product-return"]
  f.originalReturns = {
    snapshot: {
      ...scoped,
      currencyCode: "NGN",
      bookSequence: 5n,
      returns: [
        {
          id: "product-return",
          orderLineId: "line",
          disposition: "RESTOCK",
          stockOperationId: "o3",
          destinationBalanceSourceId: "balance",
          effectiveAt: at,
          actorUserId: "actor",
          payloadHash: "d".repeat(64),
        },
      ],
    },
    returns: [
      {
        id: "return-cost",
        ...scoped,
        orderLineId: "line",
        productReturnId: "product-return",
        canonicalQuantity: "1",
        disposition: "RESTOCK",
        sourceCostMinor: null,
        unknownReason: "MISSING_ISSUE_COST",
      },
    ],
    allocations: [
      {
        id: "ra1",
        ...scoped,
        orderLineId: "line",
        returnCostId: "return-cost",
        fulfillmentId: "fulfillment",
        originalIssueId: "v2",
        canonicalQuantity: "1",
        remainingQuantityBefore: "1",
        remainingQuantityAfter: "0",
        sourceCostMinor: null,
        unknownReason: "MISSING_ISSUE_COST",
        remainingCostBeforeMinor: null,
        remainingCostAfterMinor: null,
      },
    ],
  }
  return f
}
test("Product return requires exact original allocation/issue and actual recovery operation authority", () => {
  expect(audit(restockFixture()).originalSourceBindingsProved).toBe(true)
})
test("canonical Product-return node alone cannot prove its physical return binding", () => {
  const f = restockFixture()
  f.originalReturns = undefined
  const proof = audit(f)
  expect(proof.originalSourceBindingsProved).toBe(false)
  expect(proof.blockers.map((b) => b.code)).toContain(
    "PRIOR_ORIGINAL_SOURCE_PROOF_REQUIRED",
  )
})
for (const field of [
  "originalIssueId",
  "recordedCost",
  "stockOperationId",
] as const)
  test(`rejects valid-FK return with borrowed ${field} authority`, () => {
    const f = restockFixture()
    if (!f.originalReturns) throw new Error("Missing QA returns")
    if (field === "stockOperationId")
      first(f.originalReturns.snapshot.returns).stockOperationId =
        "other-operation"
    else if (field === "originalIssueId")
      first(f.originalReturns.allocations).originalIssueId = "v1"
    else first(f.originalReturns.allocations).sourceCostMinor = 0n
    expect(() => audit(f)).toThrow("return allocation borrows")
  })
test("review pool snapshot cannot omit its own original physical allocation history", () => {
  const f = fixture()
  first(f.snapshot.poolSnapshots).expectedMovementCount = 0n
  expect(() => audit(f)).toThrow("omits its own original physical")
})
test("review pool physical sequence cannot precede its allocated original event", () => {
  const f = fixture()
  first(f.snapshot.poolSnapshots).expectedValuationSequence = 0n
  expect(() => audit(f)).toThrow("omits its own original physical")
})
test("same physical stamp cannot claim different original pool quantity", () => {
  const f = fixture()
  first(f.snapshot.poolSnapshots).quantity = dec("3")
  expect(() => audit(f)).toThrow("rewrites original physical quantity")
})
