import { z } from "zod"
import {
  type ReviewedCostTraceNode,
  previewReviewedInventoryCostTrace,
} from "./reviewed-cost-trace"
import { FinanceError, financePayloadHash, validateFinanceLines } from "./rules"
import { normalizeQuantity } from "./valuation-math"

export const REVIEWED_COST_CONFIRMATION_CONTRACT_VERSION =
  "reviewed-cost-confirmation-v1"
const ALGORITHM = "weighted-average-original-return-v1"
const MAX_MINOR = 9223372036854775807n
const id = z
  .string()
  .min(1)
  .max(256)
  .refine((value) => value.trim() === value)
const hash = z.string().regex(/^[a-f0-9]{64}$/)
const minor = z
  .string()
  .regex(/^(0|[1-9]\d{0,18})$/)
  .refine(
    (value) => /^(0|[1-9]\d{0,18})$/.test(value) && BigInt(value) <= MAX_MINOR,
  )
const ordinal = minor.refine((value) => value !== "0")
const signedMinor = z
  .string()
  .regex(/^(0|-?[1-9]\d{0,18})$/)
  .refine(
    (value) =>
      /^(0|-?[1-9]\d{0,18})$/.test(value) &&
      BigInt(value) >= -MAX_MINOR &&
      BigInt(value) <= MAX_MINOR,
  )
const quantity = z
  .string()
  .max(40)
  .refine((value) => {
    try {
      return normalizeQuantity(value) === value
    } catch {
      return false
    }
  })
const instant = z.string().refine((value) => {
  try {
    return new Date(value).toISOString() === value
  } catch {
    return false
  }
})
const classification = z.enum([
  "OPENING_BALANCE",
  "ACQUISITION",
  "OWNER_CONTRIBUTION",
  "INVENTORY_GAIN",
  "SOURCE_CORRECTION",
])
const monetaryClassification = z.enum([
  ...classification.options,
  "COUNT_SHORTAGE",
  "CLOSEOUT_SHORTAGE",
  "LOSS",
  "CONSUMPTION",
  "SUPPLIER_RETURN",
  "EARNED_ISSUE_COGS",
  "EARNED_RETURN_COGS",
  "RESTORATION",
  "TRANSFER",
])
const account = z
  .object({
    id,
    bookId: id,
    code: id,
    kind: z.enum(["ASSET", "LIABILITY", "EQUITY", "INCOME", "EXPENSE"]),
    purpose: z.enum([
      "CASH",
      "BANK",
      "CLEARING",
      "RECEIVABLE",
      "PAYABLE",
      "CUSTOMER_ADVANCE",
      "SUPPLIER_ADVANCE",
      "INVENTORY",
      "SALES",
      "COST_OF_SALES",
      "OPERATING_EXPENSE",
      "CAPITAL",
      "DRAWINGS",
      "OPENING_EQUITY",
      "OTHER",
    ]),
  })
  .strict()
const context = z
  .object({
    reviewId: id,
    tenantId: id,
    bookId: id,
    currencyCode: z.string().regex(/^[A-Z]{3}$/),
    actorUserId: id,
    clientCommandId: id.max(128),
    reason: z
      .string()
      .min(1)
      .max(1000)
      .refine((value) => value.trim() === value),
    reviewedBookSequence: minor,
    historyThrough: instant,
    evidenceCutoff: instant,
  })
  .strict()
const pool = z
  .object({
    poolId: id,
    balanceSourceId: id,
    productId: id,
    variantId: id,
    inventoryUnitId: id,
    configurationVersionId: id,
    unitFactor: quantity.refine((value) => value !== "0"),
    stockKind: z.enum(["SHARED_POOL", "PACKAGED_STOCK"]),
    endingQuantity: quantity,
    recordedValueMinor: minor.nullable(),
    expectedStockRevision: z.number().int().min(0).max(2147483647),
    expectedMovementCount: minor,
    expectedValuationSequence: minor,
    lastCostReviewSnapshotId: id.nullable(),
  })
  .strict()
const owner = z
  .object({
    sourceKind: id,
    sourceId: id,
    clientCommandId: id,
    payloadHash: hash,
    actorUserId: id,
    effectiveAt: instant,
    sourceFactsHash: hash,
  })
  .strict()
const node = z
  .object({
    sourceKey: id,
    balanceSourceId: id,
    kind: z.enum([
      "ORIGIN",
      "WITHDRAWAL",
      "TRANSFER_OUT",
      "TRANSFER_IN",
      "RETURN_RESTOCK",
      "RETURN_NON_RESTOCK",
      "RESTORATION",
    ]),
    withdrawalPurpose: z
      .enum([
        "PRODUCT_ISSUE",
        "STANDALONE_COMMITMENT",
        "ORDINARY",
        "COUNT_SHORTAGE",
        "CLOSEOUT_SHORTAGE",
        "SUPPLIER_RETURN",
      ])
      .nullable(),
    ordinal,
    effectiveAt: instant,
    quantity,
    quantityBefore: quantity,
    quantityAfter: quantity,
    recordedCostMinor: minor.nullable(),
    valuationEventId: id.nullable(),
    stockOperationId: id.nullable(),
    stockMovementId: id.nullable(),
    productReturnAllocationId: id.nullable(),
    originalSourceKey: id.nullable(),
    originalRemainingQuantityBefore: quantity.nullable(),
    returnOrdinal: ordinal.nullable(),
    previousResolutionId: id.nullable(),
    owner,
  })
  .strict()
const evidence = z
  .object({
    evidenceId: id,
    sourceKey: id,
    mode: z.enum(["RESOLVE_UNKNOWN", "CORRECT_RECORDED"]),
    classification,
    originalCostMinor: minor,
    evidenceReference: z.string().min(1).max(512),
    sourceDocumentKind: id,
    sourceDocumentId: id.nullable(),
    sourceEffectiveAt: instant,
    postingEffectiveAt: instant,
    counterAccountId: id.nullable(),
    billLineId: id.nullable(),
    sourceJournalEntryId: id.nullable(),
    basisHash: hash,
  })
  .strict()
const priorHeader = z
  .object({
    reviewId: id,
    contractVersion: z.literal(REVIEWED_COST_CONFIRMATION_CONTRACT_VERSION),
    algorithmVersion: z.literal(ALGORITHM),
    costTraceHash: hash,
    balanceSourceId: id,
    poolId: id,
    reviewedSnapshotHash: hash,
    topologyHash: hash,
    journalFactsHash: hash,
  })
  .strict()
const priorResolution = priorHeader
  .extend({
    resolutionId: id,
    previousResolutionId: id.nullable(),
    resolvedCostMinor: minor,
    allocationFactsHash: hash,
    sourceKey: id,
  })
  .strict()
const priorPool = priorHeader
  .extend({
    snapshotId: id,
    quantity,
    valueBeforeMinor: minor.nullable(),
    valueAfterMinor: minor,
    poolFactsHash: hash,
  })
  .strict()
const originalJournal = z
  .object({
    entryId: id,
    storeId: id.nullable(),
    expectedLineCount: z.number().int().min(2).max(100),
    bookId: id,
    sequence: ordinal,
    sourceKind: id,
    sourceId: id,
    actorUserId: id,
    effectiveAt: instant,
    recordedAt: instant,
    payloadHash: hash,
    clientCommandId: id,
    reversalOfId: id.nullable(),
    reversalId: id.nullable(),
    factsHash: hash,
  })
  .strict()
const sourceSchema = z
  .object({
    contractVersion: z.literal(REVIEWED_COST_CONFIRMATION_CONTRACT_VERSION),
    documentKind: z.literal("SOURCE_SNAPSHOT"),
    algorithmVersion: z.literal(ALGORITHM),
    context,
    hashes: z
      .object({
        physicalSnapshotHash: hash,
        sourceDiscoveryHash: hash,
        owningSourceSnapshotHash: hash,
        returnSourceSnapshotHash: hash,
        assemblySnapshotHash: hash,
        repositorySourceSnapshotHash: hash,
        costTraceHash: hash,
      })
      .strict(),
    pools: z.array(pool).min(1).max(128),
    nodes: z.array(node).min(1).max(4096),
    evidence: z.array(evidence).max(4096),
    priorResolutions: z.array(priorResolution).max(4096),
    priorPoolSnapshots: z.array(priorPool).max(128),
    originalJournals: z.array(originalJournal).max(4096),
    accounts: z.array(account).max(4096),
  })
  .strict()
const allocation = z
  .object({
    sourceKey: id,
    resolvedCostMinor: minor,
    differenceMinor: signedMinor.nullable(),
    classification: z.union([
      monetaryClassification,
      z.literal("UNCLASSIFIED"),
    ]),
    classificationBasisHash: hash.nullable(),
    evidenceId: id.nullable(),
    monetaryTreatment: z.enum([
      "PROPOSED_ADJUSTMENT",
      "UNCHANGED_POSTED",
      "DEFERRED_RECOGNITION",
      "NO_MONETARY_EFFECT",
    ]),
    groupKeys: z.array(id).max(4096),
    originalJournalEntryId: id.nullable(),
  })
  .strict()
const group = z
  .object({
    groupKey: id,
    allocationSourceKeys: z.array(id).min(1).max(4096),
    evidenceIds: z.array(id).max(4096),
    classifications: z
      .array(
        z
          .object({
            sourceKey: id,
            evidenceId: id.nullable(),
            classification: monetaryClassification,
            basisHash: hash,
          })
          .strict(),
      )
      .max(4096),
    clientCommandId: id.max(128),
    sourceKind: id.max(64),
    sourceId: id.max(128),
    actorUserId: id,
    description: z
      .string()
      .min(1)
      .max(500)
      .refine((value) => value.trim() === value),
    effectiveAt: instant,
    storeId: id.nullable(),
    reversalOfId: id.nullable(),
    lines: z
      .array(
        z
          .object({
            accountId: id,
            side: z.enum(["DEBIT", "CREDIT"]),
            amountMinor: minor.refine((value) => value !== "0"),
            description: z
              .string()
              .min(1)
              .max(500)
              .refine((value) => value.trim() === value)
              .nullable(),
          })
          .strict(),
      )
      .min(2)
      .max(100),
    postingPayloadHash: hash,
  })
  .strict()
const planSchema = z
  .object({
    contractVersion: z.literal(REVIEWED_COST_CONFIRMATION_CONTRACT_VERSION),
    documentKind: z.literal("POSTING_PLAN"),
    sourceSnapshotHash: hash,
    allocations: z.array(allocation).min(1).max(4096),
    pools: z
      .array(
        z.object({ balanceSourceId: id, resolvedValueMinor: minor }).strict(),
      )
      .min(1)
      .max(128),
    groups: z.array(group).max(4096),
  })
  .strict()
const savedSchema = z
  .object({
    sourceSnapshot: sourceSchema,
    postingPlan: planSchema,
    reviewedSnapshotHash: hash,
  })
  .strict()
export type ReviewedCostConfirmationSourceSnapshot = z.infer<
  typeof sourceSchema
>
export type ReviewedCostConfirmationPostingPlan = z.infer<typeof planSchema>
export type ReviewedCostConfirmationSaved = z.infer<typeof savedSchema>
const inputSchema = z
  .object({
    sourceSnapshot: sourceSchema
      .omit({
        contractVersion: true,
        documentKind: true,
        algorithmVersion: true,
        hashes: true,
      })
      .extend({
        hashes: sourceSchema.shape.hashes.omit({ costTraceHash: true }),
      }),
    postingPlan: planSchema
      .omit({
        contractVersion: true,
        documentKind: true,
        sourceSnapshotHash: true,
        groups: true,
      })
      .extend({
        groups: z.array(group.omit({ postingPayloadHash: true })).max(4096),
      }),
  })
  .strict()
export type ReviewedCostConfirmationInput = z.infer<typeof inputSchema>
export type ReviewedCostConfirmationExpectedHeader = z.infer<typeof context> & {
  algorithmVersion: typeof ALGORITHM
  costTraceHash: string
  reviewedSnapshotHash: string
}
function conflict(message: string): never {
  throw new FinanceError(
    "CONFLICT",
    `Saved cost confirmation contract ${message}`,
  )
}
function unique<T>(rows: T[], key: (row: T) => string) {
  const result = new Map(rows.map((row) => [key(row), row]))
  if (result.size !== rows.length) conflict("has duplicate identities.")
  return result
}
function setMatches(expected: string[], actual: string[]) {
  const expectedSet = unique(expected, (x) => x)
  const actualSet = unique(actual, (x) => x)
  if (
    expectedSet.size !== actualSet.size ||
    [...expectedSet.keys()].some((key) => !actualSet.has(key))
  )
    conflict("has missing, extra or borrowed references.")
}
// Check the aggregate plan budget before parsing every nested row. Individual
// schemas enforce their own bounds; this never truncates a complete plan.
function checkPlanBudget(value: unknown) {
  if (value === null || typeof value !== "object" || !("groups" in value))
    return
  if (!Array.isArray(value.groups)) return
  if (value.groups.length > 4096)
    conflict("input shape/version is unsupported.")
  let references = 0
  let lines = 0
  for (const group of value.groups) {
    if (group === null || typeof group !== "object") continue
    for (const key of [
      "allocationSourceKeys",
      "evidenceIds",
      "classifications",
    ]) {
      if (key in group && Array.isArray(group[key]))
        references += group[key].length
    }
    if ("lines" in group && Array.isArray(group.lines))
      lines += group.lines.length
    if (references > 32768 || lines > 32768)
      conflict("posting plan exceeds complete bounded references/lines.")
  }
  if (!("allocations" in value) || !Array.isArray(value.allocations)) return
  let memberships = 0
  for (const allocation of value.allocations) {
    if (
      allocation !== null &&
      typeof allocation === "object" &&
      "groupKeys" in allocation &&
      Array.isArray(allocation.groupKeys)
    )
      memberships += allocation.groupKeys.length
    if (memberships > 32768)
      conflict("posting plan exceeds bounded memberships.")
  }
}
function traceNode(
  n: ReviewedCostConfirmationSourceSnapshot["nodes"][number],
): ReviewedCostTraceNode {
  const base = {
    id: n.sourceKey,
    balanceSourceId: n.balanceSourceId,
    ordinal: BigInt(n.ordinal),
    effectiveAt: new Date(n.effectiveAt),
    quantity: n.quantity,
    quantityBefore: n.quantityBefore,
    quantityAfter: n.quantityAfter,
    recordedCostMinor:
      n.recordedCostMinor === null ? null : BigInt(n.recordedCostMinor),
  }
  if (n.kind === "WITHDRAWAL") {
    if (n.withdrawalPurpose === null)
      conflict("withdrawal lacks its original purpose.")
    return { ...base, kind: n.kind, purpose: n.withdrawalPurpose }
  }
  if (n.withdrawalPurpose !== null)
    conflict("non-withdrawal borrows a purpose.")
  if (n.kind === "TRANSFER_IN") {
    if (n.originalSourceKey === null)
      conflict("transfer lacks its original allocation.")
    return { ...base, kind: n.kind, sourceEventId: n.originalSourceKey }
  }
  if (
    n.kind === "RETURN_RESTOCK" ||
    n.kind === "RETURN_NON_RESTOCK" ||
    n.kind === "RESTORATION"
  ) {
    if (
      n.originalSourceKey === null ||
      n.returnOrdinal === null ||
      n.originalRemainingQuantityBefore === null
    )
      conflict("return/restoration lacks original dependency facts.")
    if (
      n.kind !== "RETURN_RESTOCK" &&
      n.kind !== "RETURN_NON_RESTOCK" &&
      n.kind !== "RESTORATION"
    )
      conflict("has unsupported node kind.")
    return {
      ...base,
      kind: n.kind,
      originalIssueId: n.originalSourceKey,
      returnOrdinal: BigInt(n.returnOrdinal),
      originalRemainingQuantityBefore: n.originalRemainingQuantityBefore,
    }
  }
  return { ...base, kind: n.kind }
}
// Prior resolved amounts are preserved dependencies, not calculation overlays.
// Repository adoption must reconcile actual accepted prior evidence and amounts.
function calculate(source: ReviewedCostConfirmationSourceSnapshot) {
  const c = source.context
  return previewReviewedInventoryCostTrace({
    tenantId: c.tenantId,
    bookId: c.bookId,
    currencyCode: c.currencyCode,
    through: new Date(c.historyThrough),
    now: new Date(c.historyThrough),
    pools: source.pools.map((p) => ({
      tenantId: c.tenantId,
      bookId: c.bookId,
      currencyCode: c.currencyCode,
      balanceSourceId: p.balanceSourceId,
      productId: p.productId,
      variantId: p.variantId,
      expectedEndingQuantity: p.endingQuantity,
    })),
    nodes: source.nodes.map(traceNode),
    evidence: source.evidence.map((e) => ({
      eventId: e.sourceKey,
      mode: e.mode,
      originalCostMinor: BigInt(e.originalCostMinor),
      evidenceReference: e.evidenceReference,
    })),
  })
}
function postingHash(
  g:
    | ReviewedCostConfirmationPostingPlan["groups"][number]
    | ReviewedCostConfirmationInput["postingPlan"]["groups"][number],
) {
  let lines: ReturnType<typeof validateFinanceLines>
  try {
    lines = validateFinanceLines(
      g.lines.map((line) => ({
        ...line,
        description: line.description ?? undefined,
      })),
    )
  } catch {
    conflict("posting group lines violate the actual journal writer bounds.")
  }
  return financePayloadHash({
    sourceKind: g.sourceKind,
    sourceId: g.sourceId,
    description: g.description,
    effectiveAt: new Date(g.effectiveAt),
    storeId: g.storeId,
    lines,
    ...(g.reversalOfId === null ? {} : { reversalOfId: g.reversalOfId }),
  })
}
function sortBy<T>(rows: T[], key: (row: T) => string) {
  return [...rows].sort((a, b) =>
    key(a) < key(b) ? -1 : key(a) > key(b) ? 1 : 0,
  )
}
function canonical(
  saved: ReviewedCostConfirmationSaved,
): ReviewedCostConfirmationSaved {
  const s = saved.sourceSnapshot
  const p = saved.postingPlan
  return {
    ...saved,
    sourceSnapshot: {
      ...s,
      pools: sortBy(s.pools, (x) => x.balanceSourceId),
      nodes: sortBy(s.nodes, (x) => x.sourceKey),
      evidence: sortBy(s.evidence, (x) => x.evidenceId),
      priorResolutions: sortBy(s.priorResolutions, (x) => x.resolutionId),
      priorPoolSnapshots: sortBy(s.priorPoolSnapshots, (x) => x.snapshotId),
      originalJournals: sortBy(s.originalJournals, (x) => x.entryId),
      accounts: sortBy(s.accounts, (x) => x.id),
    },
    postingPlan: {
      ...p,
      allocations: sortBy(p.allocations, (x) => x.sourceKey).map((a) => ({
        ...a,
        groupKeys: [...a.groupKeys].sort(),
      })),
      pools: sortBy(p.pools, (x) => x.balanceSourceId),
      groups: sortBy(p.groups, (x) => x.groupKey).map((g) => ({
        ...g,
        allocationSourceKeys: [...g.allocationSourceKeys].sort(),
        evidenceIds: [...g.evidenceIds].sort(),
        classifications: sortBy(g.classifications, (x) => x.sourceKey),
      })),
    },
  }
}
function reviewedHash(
  saved: Pick<ReviewedCostConfirmationSaved, "sourceSnapshot" | "postingPlan">,
) {
  return financePayloadHash({
    contractVersion: REVIEWED_COST_CONFIRMATION_CONTRACT_VERSION,
    sourceSnapshot: saved.sourceSnapshot,
    postingPlan: saved.postingPlan,
  })
}
function validate(saved: ReviewedCostConfirmationSaved) {
  const s = saved.sourceSnapshot
  const p = saved.postingPlan
  const c = s.context
  const pools = unique(s.pools, (x) => x.balanceSourceId)
  unique(s.pools, (x) => x.poolId)
  const nodes = unique(s.nodes, (x) => x.sourceKey)
  unique(
    s.nodes.filter((n) => n.valuationEventId !== null),
    (n) => n.valuationEventId ?? "",
  )
  unique(
    s.nodes.filter((n) => n.stockMovementId !== null),
    (n) => n.stockMovementId ?? "",
  )
  unique(
    s.nodes.filter((n) => n.productReturnAllocationId !== null),
    (n) => n.productReturnAllocationId ?? "",
  )
  const evidences = unique(s.evidence, (x) => x.evidenceId)
  unique(s.evidence, (x) => x.sourceKey)
  const priors = unique(s.priorResolutions, (x) => x.resolutionId)
  const priorPools = unique(s.priorPoolSnapshots, (x) => x.snapshotId)
  const journals = unique(s.originalJournals, (x) => x.entryId)
  const accounts = unique(s.accounts, (x) => x.id)
  unique(s.priorPoolSnapshots, (x) => x.poolId)
  unique(s.originalJournals, (x) => x.sequence)
  unique(s.originalJournals, (x) => x.clientCommandId)
  for (const a of accounts.values())
    if (a.bookId !== c.bookId) conflict("account crosses held Book.")
  for (const j of journals.values()) {
    if (
      j.bookId !== c.bookId ||
      BigInt(j.sequence) > BigInt(c.reviewedBookSequence)
    )
      conflict("original journal crosses Book or reviewed watermark.")
    if (j.reversalOfId !== null) {
      const original = journals.get(j.reversalOfId)
      if (
        !original ||
        original.reversalId !== j.entryId ||
        original.reversalOfId !== null ||
        j.reversalId !== null ||
        original.storeId !== j.storeId ||
        new Date(original.recordedAt) > new Date(j.recordedAt) ||
        new Date(original.effectiveAt) > new Date(j.effectiveAt) ||
        BigInt(original.sequence) >= BigInt(j.sequence)
      )
        conflict("original journal reversal closure differs.")
    }
    if (
      j.reversalId !== null &&
      journals.get(j.reversalId)?.reversalOfId !== j.entryId
    )
      conflict("original journal reciprocal reversal is missing.")
  }
  const priorHeaders = new Map<string, string>()
  for (const dependency of [...s.priorResolutions, ...s.priorPoolSnapshots]) {
    const fingerprint = financePayloadHash({
      algorithmVersion: dependency.algorithmVersion,
      costTraceHash: dependency.costTraceHash,
      contractVersion: dependency.contractVersion,
      reviewedSnapshotHash: dependency.reviewedSnapshotHash,
      topologyHash: dependency.topologyHash,
      journalFactsHash: dependency.journalFactsHash,
    })
    const previous = priorHeaders.get(dependency.reviewId)
    if (previous !== undefined && previous !== fingerprint)
      conflict("prior dependency header fingerprints disagree.")
    priorHeaders.set(dependency.reviewId, fingerprint)
  }
  for (const n of nodes.values()) {
    const pool = pools.get(n.balanceSourceId)
    if (!pool || n.owner.effectiveAt !== n.effectiveAt)
      conflict("node ownership/date or pool binding differs.")
    const returning = [
      "RETURN_RESTOCK",
      "RETURN_NON_RESTOCK",
      "RESTORATION",
    ].includes(n.kind)
    const dependent = returning || n.kind === "TRANSFER_IN"
    if (
      dependent !== (n.originalSourceKey !== null) ||
      returning !==
        (n.returnOrdinal !== null &&
          n.originalRemainingQuantityBefore !== null) ||
      (!returning &&
        (n.returnOrdinal !== null ||
          n.originalRemainingQuantityBefore !== null))
    )
      conflict("node optional dependencies are inconsistent.")
    const productReturn =
      n.kind === "RETURN_RESTOCK" || n.kind === "RETURN_NON_RESTOCK"
    if (productReturn !== (n.productReturnAllocationId !== null))
      conflict("node has inconsistent typed return binding.")
    if (n.kind === "RETURN_NON_RESTOCK") {
      if (
        n.stockMovementId !== null ||
        n.stockOperationId !== null ||
        n.valuationEventId !== null ||
        n.sourceKey !== `return-allocation:${n.productReturnAllocationId}`
      )
        conflict("nonphysical return borrows movement authority.")
    } else if (
      n.stockMovementId === null ||
      n.stockOperationId === null ||
      n.valuationEventId === null ||
      n.sourceKey !==
        (productReturn
          ? `return-allocation:${n.productReturnAllocationId}`
          : `movement:${n.stockMovementId}`)
    )
      conflict("physical node lacks exact typed source identity.")
    if (n.previousResolutionId !== null) {
      const previous = priors.get(n.previousResolutionId)
      if (
        !previous ||
        previous.sourceKey !== n.sourceKey ||
        previous.balanceSourceId !== n.balanceSourceId ||
        previous.poolId !== pool.poolId ||
        previous.reviewId === c.reviewId
      )
        conflict("node predecessor is missing or crossed.")
    }
  }
  setMatches(
    s.nodes.flatMap((n) =>
      n.previousResolutionId === null ? [] : [n.previousResolutionId],
    ),
    s.priorResolutions.map((x) => x.resolutionId),
  )
  for (const pool of pools.values())
    if (pool.lastCostReviewSnapshotId !== null) {
      const prior = priorPools.get(pool.lastCostReviewSnapshotId)
      if (
        !prior ||
        prior.poolId !== pool.poolId ||
        prior.balanceSourceId !== pool.balanceSourceId ||
        prior.reviewId === c.reviewId
      )
        conflict("current prior pool pointer is missing or crossed.")
    }
  setMatches(
    s.pools.flatMap((x) =>
      x.lastCostReviewSnapshotId === null ? [] : [x.lastCostReviewSnapshotId],
    ),
    s.priorPoolSnapshots.map((x) => x.snapshotId),
  )
  for (const e of evidences.values())
    if (
      nodes.get(e.sourceKey)?.kind !== "ORIGIN" ||
      (e.counterAccountId !== null && !accounts.has(e.counterAccountId)) ||
      (e.sourceJournalEntryId !== null && !journals.has(e.sourceJournalEntryId))
    )
      conflict("evidence original/account/journal identity is missing.")
  const result = calculate(s)
  if (
    !result.completeCostTrace ||
    result.costTraceHash !== s.hashes.costTraceHash
  )
    conflict("has missing original cost or changed calculator fingerprint.")
  const allocations = unique(p.allocations, (x) => x.sourceKey)
  const groups = unique(p.groups, (x) => x.groupKey)
  const planPools = unique(p.pools, (x) => x.balanceSourceId)
  const groupKeysBySource = new Map<string, string[]>()
  for (const g of groups.values()) {
    for (const key of g.allocationSourceKeys) {
      const memberships = groupKeysBySource.get(key) ?? []
      memberships.push(g.groupKey)
      groupKeysBySource.set(key, memberships)
    }
  }
  const allocationGroups = new Map(
    p.allocations.map((a) => [a.sourceKey, new Set(a.groupKeys)]),
  )
  unique(p.groups, (x) => x.clientCommandId)
  unique(p.groups, (x) => JSON.stringify([x.sourceKind, x.sourceId]))
  setMatches([...nodes.keys()], [...allocations.keys()])
  setMatches([...pools.keys()], [...planPools.keys()])
  for (const resolved of result.allocations) {
    const a = allocations.get(resolved.node.id)
    if (
      !a ||
      a.resolvedCostMinor !== resolved.resolvedCostMinor?.toString() ||
      a.differenceMinor !==
        (resolved.differenceMinor === null
          ? null
          : resolved.differenceMinor.toString())
    )
      conflict("changes exact resolved cost or UNKNOWN difference.")
    if (
      a.originalJournalEntryId !== null &&
      !journals.has(a.originalJournalEntryId)
    )
      conflict("allocation borrows missing original journal.")
    if (
      (a.monetaryTreatment === "PROPOSED_ADJUSTMENT") !==
        a.groupKeys.length > 0 ||
      (a.monetaryTreatment === "UNCHANGED_POSTED" &&
        a.originalJournalEntryId === null) ||
      (a.monetaryTreatment === "NO_MONETARY_EFFECT" &&
        (a.resolvedCostMinor !== "0" || a.originalJournalEntryId !== null))
    )
      conflict("allocation lacks explicit monetary treatment/group ownership.")
    if (
      (a.classification === "UNCLASSIFIED" &&
        (a.classificationBasisHash !== null ||
          a.evidenceId !== null ||
          a.monetaryTreatment === "PROPOSED_ADJUSTMENT" ||
          a.monetaryTreatment === "UNCHANGED_POSTED")) ||
      (a.classification !== "UNCLASSIFIED" &&
        a.classificationBasisHash === null)
    )
      conflict("allocation lacks explicit classification basis or deferral.")
    if (a.evidenceId !== null) {
      const e = evidences.get(a.evidenceId)
      if (
        !e ||
        (resolved.node.kind === "ORIGIN" &&
          (e.sourceKey !== a.sourceKey ||
            e.classification !== a.classification))
      )
        conflict("allocation borrows another original evidence classification.")
    }
    setMatches(a.groupKeys, groupKeysBySource.get(a.sourceKey) ?? [])
  }
  for (const resolved of result.pools)
    if (
      planPools.get(resolved.balanceSourceId)?.resolvedValueMinor !==
      resolved.valueMinor?.toString()
    )
      conflict("changes resolved ending pool value.")
  let references = 0
  let lines = 0
  for (const g of groups.values()) {
    references +=
      g.allocationSourceKeys.length +
      g.evidenceIds.length +
      g.classifications.length
    lines += g.lines.length
    if (references > 32768 || lines > 32768)
      conflict("posting plan exceeds complete bounded references/lines.")
    if (
      g.actorUserId !== c.actorUserId ||
      g.postingPayloadHash !== postingHash(g) ||
      (g.reversalOfId !== null && !journals.has(g.reversalOfId))
    )
      conflict(
        "group actor/original journal or ordered writer fingerprint differs.",
      )
    setMatches(
      g.allocationSourceKeys,
      g.allocationSourceKeys.filter((key) =>
        allocationGroups.get(key)?.has(g.groupKey),
      ),
    )
    setMatches(
      g.allocationSourceKeys,
      g.classifications.map((x) => x.sourceKey),
    )
    setMatches(g.evidenceIds, [
      ...new Set(
        g.classifications.flatMap((x) =>
          x.evidenceId === null ? [] : [x.evidenceId],
        ),
      ),
    ])
    for (const classification of g.classifications) {
      const a = allocations.get(classification.sourceKey)
      if (
        !a ||
        a.classification !== classification.classification ||
        a.classificationBasisHash !== classification.basisHash ||
        a.evidenceId !== classification.evidenceId
      )
        conflict(
          "group changes exact allocation classification/basis/evidence.",
        )
    }
    for (const line of g.lines)
      if (!accounts.has(line.accountId))
        conflict("journal line account is missing from exact Book manifest.")
  }
  if (
    p.sourceSnapshotHash !== financePayloadHash(s) ||
    saved.reviewedSnapshotHash !== reviewedHash(saved)
  )
    conflict("source/plan pair hash differs from saved bytes.")
}

/** Private wire codec only; declared identities/enums/hashes confer no source or fiscal authority. */
export function encodeReviewedCostConfirmationContract(
  input: ReviewedCostConfirmationInput,
): ReviewedCostConfirmationSaved {
  checkPlanBudget(input.postingPlan)
  const parsed = inputSchema.safeParse(input)
  if (!parsed.success) conflict("input shape/version is unsupported.")
  const source: ReviewedCostConfirmationSourceSnapshot = {
    ...parsed.data.sourceSnapshot,
    contractVersion: REVIEWED_COST_CONFIRMATION_CONTRACT_VERSION,
    documentKind: "SOURCE_SNAPSHOT",
    algorithmVersion: ALGORITHM,
    hashes: {
      ...parsed.data.sourceSnapshot.hashes,
      costTraceHash: "0".repeat(64),
    },
  }
  const computed = calculate(source)
  const plan: ReviewedCostConfirmationPostingPlan = {
    ...parsed.data.postingPlan,
    contractVersion: REVIEWED_COST_CONFIRMATION_CONTRACT_VERSION,
    documentKind: "POSTING_PLAN",
    sourceSnapshotHash: "0".repeat(64),
    groups: parsed.data.postingPlan.groups.map((g) => ({
      ...g,
      postingPayloadHash: postingHash(g),
    })),
  }
  const saved = canonical({
    sourceSnapshot: {
      ...source,
      hashes: { ...source.hashes, costTraceHash: computed.costTraceHash },
    },
    postingPlan: plan,
    reviewedSnapshotHash: "0".repeat(64),
  })
  saved.postingPlan.sourceSnapshotHash = financePayloadHash(
    saved.sourceSnapshot,
  )
  saved.reviewedSnapshotHash = reviewedHash(saved)
  validate(saved)
  return saved
}

/** Expected header comes from held Book and persisted review, never public caller JSON. */
export function decodeReviewedCostConfirmationContract(
  value: unknown,
  expected: ReviewedCostConfirmationExpectedHeader,
) {
  if (value !== null && typeof value === "object" && "postingPlan" in value)
    checkPlanBudget(value.postingPlan)
  const parsed = savedSchema.safeParse(value)
  if (!parsed.success)
    conflict(
      "shape/version is unsupported; unversioned QA JSON is not authority.",
    )
  const saved = parsed.data
  if (financePayloadHash(saved) !== financePayloadHash(canonical(saved)))
    conflict("uses noncanonical identity/reference ordering.")
  const {
    algorithmVersion,
    costTraceHash,
    reviewedSnapshotHash,
    ...expectedContext
  } = expected
  if (
    financePayloadHash(saved.sourceSnapshot.context) !==
      financePayloadHash(expectedContext) ||
    saved.sourceSnapshot.algorithmVersion !== algorithmVersion ||
    saved.sourceSnapshot.hashes.costTraceHash !== costTraceHash ||
    saved.reviewedSnapshotHash !== reviewedSnapshotHash
  )
    conflict("differs from held scope and original persisted header.")
  validate(saved)
  return {
    saved,
    scope: "PRIVATE_SAVED_COST_CONFIRMATION_CONTRACT" as const,
    requiresOwningSourceProof: true as const,
    requiresPhysicalCompletenessProof: true as const,
    requiresEvidenceClassificationProof: true as const,
    requiresAcceptedPriorProof: true as const,
    requiresPostedJournalOwnershipProof: true as const,
    requiresConfirmationProof: true as const,
    requiresPriorReviewProof: true as const,
  }
}
