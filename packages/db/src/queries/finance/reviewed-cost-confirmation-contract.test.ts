import { describe, expect, test } from "bun:test"
import {
  type ReviewedCostConfirmationExpectedHeader,
  type ReviewedCostConfirmationInput,
  type ReviewedCostConfirmationSaved,
  decodeReviewedCostConfirmationContract,
  encodeReviewedCostConfirmationContract,
} from "./reviewed-cost-confirmation-contract"
import { FinanceError, financePayloadHash, validateFinanceLines } from "./rules"

const date = "2026-10-01T12:00:00.000Z"
const cutoff = "2026-10-02T12:00:00.000Z"
const h = (character: string) => character.repeat(64)
function fixture(): ReviewedCostConfirmationInput {
  const original = {
    sourceKey: "movement:opening",
    balanceSourceId: "balance",
    kind: "ORIGIN" as const,
    withdrawalPurpose: null,
    ordinal: "1",
    effectiveAt: date,
    quantity: "4",
    quantityBefore: "0",
    quantityAfter: "4",
    recordedCostMinor: null,
    valuationEventId: "opening-event",
    stockOperationId: "opening-operation",
    stockMovementId: "opening",
    productReturnAllocationId: null,
    originalSourceKey: null,
    originalRemainingQuantityBefore: null,
    returnOrdinal: null,
    previousResolutionId: null,
    owner: {
      sourceKind: "INVENTORY_OPENING",
      sourceId: "opening-source",
      clientCommandId: "opening-command",
      payloadHash: h("a"),
      actorUserId: "opening-actor",
      effectiveAt: date,
      sourceFactsHash: h("b"),
    },
  }
  return {
    sourceSnapshot: {
      context: {
        reviewId: "review",
        tenantId: "tenant",
        bookId: "book",
        currencyCode: "NGN",
        actorUserId: "reviewer",
        clientCommandId: "review-command",
        reason: "Documented original cost",
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
          endingQuantity: "3",
          recordedValueMinor: null,
          expectedStockRevision: 2,
          expectedMovementCount: "2",
          expectedValuationSequence: "2",
          lastCostReviewSnapshotId: null,
        },
      ],
      nodes: [
        original,
        {
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
        },
      ],
      evidence: [
        {
          evidenceId: "evidence",
          sourceKey: original.sourceKey,
          mode: "RESOLVE_UNKNOWN",
          classification: "OWNER_CONTRIBUTION",
          originalCostMinor: "1001",
          evidenceReference: "approved-document",
          sourceDocumentKind: "CONTRIBUTION",
          sourceDocumentId: "contribution",
          sourceEffectiveAt: date,
          postingEffectiveAt: cutoff,
          counterAccountId: "capital",
          billLineId: null,
          sourceJournalEntryId: null,
          basisHash: h("a"),
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
          sourceKey: original.sourceKey,
          resolvedCostMinor: "1001",
          differenceMinor: null,
          classification: "OWNER_CONTRIBUTION",
          classificationBasisHash: h("a"),
          evidenceId: "evidence",
          monetaryTreatment: "PROPOSED_ADJUSTMENT",
          groupKeys: ["origin"],
          originalJournalEntryId: null,
        },
        {
          sourceKey: "movement:issue",
          resolvedCostMinor: "250",
          differenceMinor: null,
          classification: "UNCLASSIFIED",
          classificationBasisHash: null,
          evidenceId: null,
          monetaryTreatment: "DEFERRED_RECOGNITION",
          groupKeys: [],
          originalJournalEntryId: null,
        },
      ],
      pools: [{ balanceSourceId: "balance", resolvedValueMinor: "751" }],
      groups: [
        {
          groupKey: "origin",
          allocationSourceKeys: [original.sourceKey],
          evidenceIds: ["evidence"],
          classifications: [
            {
              sourceKey: original.sourceKey,
              evidenceId: "evidence",
              classification: "OWNER_CONTRIBUTION",
              basisHash: h("a"),
            },
          ],
          clientCommandId: "origin-adjustment-command",
          sourceKind: "INVENTORY_COST_REVIEW",
          sourceId: "review:origin",
          actorUserId: "reviewer",
          description: "Original contribution cost",
          effectiveAt: cutoff,
          storeId: null,
          reversalOfId: null,
          lines: [
            {
              accountId: "inventory",
              side: "DEBIT",
              amountMinor: "1001",
              description: null,
            },
            {
              accountId: "capital",
              side: "CREDIT",
              amountMinor: "1001",
              description: "Original basis",
            },
          ],
        },
      ],
    },
  }
}
function header(
  saved: ReviewedCostConfirmationSaved,
): ReviewedCostConfirmationExpectedHeader {
  return {
    ...saved.sourceSnapshot.context,
    algorithmVersion: saved.sourceSnapshot.algorithmVersion,
    costTraceHash: saved.sourceSnapshot.hashes.costTraceHash,
    reviewedSnapshotHash: saved.reviewedSnapshotHash,
  }
}
function encode(input = fixture()) {
  return encodeReviewedCostConfirmationContract(input)
}
function decode(
  saved: ReviewedCostConfirmationSaved,
  expected = header(saved),
) {
  return decodeReviewedCostConfirmationContract(saved, expected)
}
function reject(operation: () => unknown, message?: string) {
  try {
    operation()
    throw new Error("Expected rejected contract")
  } catch (error) {
    expect(error).toBeInstanceOf(FinanceError)
    if (!(error instanceof FinanceError)) throw error
    expect(error.code).toBe("CONFLICT")
    if (message) expect(error.message).toContain(message)
  }
}
function first<T>(values: T[]): T {
  const result = values[0]
  if (!result) throw new Error("Fixture is missing required row")
  return result
}
function origin(input: ReviewedCostConfirmationInput) {
  return first(input.sourceSnapshot.nodes)
}
function issue(input: ReviewedCostConfirmationInput) {
  const result = input.sourceSnapshot.nodes[1]
  if (!result) throw new Error("Fixture is missing issue")
  return result
}
function prior(input: ReviewedCostConfirmationInput) {
  origin(input).previousResolutionId = "prior-resolution"
  first(input.sourceSnapshot.pools).lastCostReviewSnapshotId = "prior-snapshot"
  const binding = {
    reviewId: "prior-review",
    contractVersion: "reviewed-cost-confirmation-v1" as const,
    algorithmVersion: "weighted-average-original-return-v1" as const,
    costTraceHash: h("a"),
    balanceSourceId: "balance",
    poolId: "pool",
    reviewedSnapshotHash: h("b"),
    topologyHash: h("c"),
    journalFactsHash: h("d"),
  }
  input.sourceSnapshot.priorResolutions = [
    {
      ...binding,
      resolutionId: "prior-resolution",
      previousResolutionId: null,
      resolvedCostMinor: "1000",
      allocationFactsHash: h("e"),
      sourceKey: "movement:opening",
    },
  ]
  input.sourceSnapshot.priorPoolSnapshots = [
    {
      ...binding,
      snapshotId: "prior-snapshot",
      quantity: "3",
      valueBeforeMinor: null,
      valueAfterMinor: "750",
      poolFactsHash: h("e"),
    },
  ]
  return input
}
function journal(input: ReviewedCostConfirmationInput) {
  input.sourceSnapshot.originalJournals = [
    {
      entryId: "journal",
      storeId: null,
      expectedLineCount: 2,
      bookId: "book",
      sequence: "7",
      sourceKind: "PRODUCT_ISSUE",
      sourceId: "issue-source",
      actorUserId: "issue-actor",
      effectiveAt: date,
      recordedAt: cutoff,
      payloadHash: h("c"),
      clientCommandId: "posted-command",
      reversalOfId: null,
      reversalId: null,
      factsHash: h("d"),
    },
  ]
  const allocation = input.postingPlan.allocations[1]
  if (!allocation) throw new Error("Fixture is missing issue allocation")
  allocation.monetaryTreatment = "UNCHANGED_POSTED"
  allocation.classification = "EARNED_ISSUE_COGS"
  allocation.classificationBasisHash = h("f")
  allocation.originalJournalEntryId = "journal"
  return input
}
function returned(
  kind: "RETURN_RESTOCK" | "RETURN_NON_RESTOCK" | "RESTORATION",
) {
  const input = fixture()
  const physical = kind !== "RETURN_NON_RESTOCK"
  const productReturn = kind !== "RESTORATION"
  const sourceKey = productReturn
    ? "return-allocation:return"
    : "movement:restore"
  input.sourceSnapshot.nodes.push({
    ...origin(input),
    kind,
    sourceKey,
    ordinal: "3",
    quantity: "1",
    quantityBefore: "3",
    quantityAfter: physical ? "4" : "3",
    originalSourceKey: "movement:issue",
    originalRemainingQuantityBefore: "1",
    returnOrdinal: "1",
    valuationEventId: physical ? "return-event" : null,
    stockOperationId: physical ? "return-operation" : null,
    stockMovementId: physical ? (productReturn ? "return" : "restore") : null,
    productReturnAllocationId: productReturn ? "return" : null,
    owner: {
      ...origin(input).owner,
      sourceKind: productReturn ? "PRODUCT_RETURN" : "SOURCE_RESTORATION",
      sourceId: "returned-source",
      clientCommandId: "returned-command",
    },
  })
  first(input.sourceSnapshot.pools).endingQuantity = physical ? "4" : "3"
  first(input.sourceSnapshot.pools).expectedMovementCount = physical ? "3" : "2"
  first(input.sourceSnapshot.pools).expectedValuationSequence = physical
    ? "3"
    : "2"
  input.postingPlan.allocations.push({
    sourceKey,
    resolvedCostMinor: "250",
    differenceMinor: null,
    classification: "UNCLASSIFIED",
    classificationBasisHash: null,
    evidenceId: null,
    monetaryTreatment: "DEFERRED_RECOGNITION",
    groupKeys: [],
    originalJournalEntryId: null,
  })
  first(input.postingPlan.pools).resolvedValueMinor = physical ? "1001" : "751"
  return input
}

describe("private versioned immutable saved cost confirmation contract", () => {
  test("round trips exact JSON strings while preserving UNKNOWN, rounding, source dates and explicit deferral", () => {
    const input = fixture()
    const before = JSON.stringify(input)
    const saved = encode(input)
    const result = decode(JSON.parse(JSON.stringify(saved)), header(saved))
    expect(JSON.stringify(input)).toBe(before)
    expect(result.saved).toEqual(saved)
    expect(first(saved.sourceSnapshot.pools).recordedValueMinor).toBeNull()
    expect(
      saved.postingPlan.allocations.map((a) => [
        a.resolvedCostMinor,
        a.differenceMinor,
      ]),
    ).toEqual([
      ["250", null],
      ["1001", null],
    ])
    expect(first(saved.postingPlan.pools).resolvedValueMinor).toBe("751")
    expect(saved.sourceSnapshot.context.historyThrough).toBe(date)
    expect(saved.sourceSnapshot.context.evidenceCutoff).toBe(cutoff)
    expect(first(saved.postingPlan.groups).effectiveAt).toBe(cutoff)
  })
  test("canonical encoder sorts identity sets while keeping ordered journal input and original dense ordinals", () => {
    const input = fixture()
    const saved = encode(input)
    input.sourceSnapshot.nodes.reverse()
    input.sourceSnapshot.accounts.reverse()
    input.postingPlan.allocations.reverse()
    expect(encode(input)).toEqual(saved)
    expect(
      first(saved.postingPlan.groups).lines.map((line) => line.accountId),
    ).toEqual(["inventory", "capital"])
    const swapped = fixture()
    first(swapped.postingPlan.groups).lines.reverse()
    const reordered = encode(swapped)
    expect(first(reordered.postingPlan.groups).postingPayloadHash).not.toBe(
      first(saved.postingPlan.groups).postingPayloadHash,
    )
    expect(reordered.reviewedSnapshotHash).not.toBe(saved.reviewedSnapshotHash)
  })
  test("writer fingerprint matches the actual ordered normalization contract", () => {
    const saved = encode()
    const g = first(saved.postingPlan.groups)
    expect(g.postingPayloadHash).toBe(
      financePayloadHash({
        sourceKind: g.sourceKind,
        sourceId: g.sourceId,
        description: g.description,
        effectiveAt: new Date(g.effectiveAt),
        storeId: null,
        lines: validateFinanceLines(
          g.lines.map((line) => ({
            ...line,
            description: line.description ?? undefined,
          })),
        ),
      }),
    )
    expect(saved.postingPlan.sourceSnapshotHash).toBe(
      financePayloadHash(saved.sourceSnapshot),
    )
    expect(saved.reviewedSnapshotHash).toBe(
      financePayloadHash({
        contractVersion: "reviewed-cost-confirmation-v1",
        sourceSnapshot: saved.sourceSnapshot,
        postingPlan: saved.postingPlan,
      }),
    )
  })
  test("valid declared classification, QA identities and self-consistent hashes confer no authority", () => {
    const result = decode(encode(prior(journal(fixture()))))
    expect(result.scope).toBe("PRIVATE_SAVED_COST_CONFIRMATION_CONTRACT")
    expect([
      result.requiresOwningSourceProof,
      result.requiresPhysicalCompletenessProof,
      result.requiresEvidenceClassificationProof,
      result.requiresAcceptedPriorProof,
      result.requiresPostedJournalOwnershipProof,
      result.requiresConfirmationProof,
      result.requiresPriorReviewProof,
    ]).toEqual(Array(7).fill(true))
  })
  test.each([
    null,
    {},
    { postingPlan: {}, sourceSnapshot: {} },
    { complete: true, classification: "SOURCE_CORRECTION" },
  ])("refuses unversioned QA or unsupported JSON %j", (value) => {
    const saved = encode()
    reject(
      () => decodeReviewedCostConfirmationContract(value, header(saved)),
      "shape/version",
    )
  })
  test.each(["sourceSnapshot", "postingPlan"] as const)(
    "refuses unknown %s version",
    (key) => {
      const saved = encode()
      const changed = JSON.parse(JSON.stringify(saved))
      changed[key].contractVersion = "reviewed-cost-confirmation-v2"
      reject(
        () => decodeReviewedCostConfirmationContract(changed, header(saved)),
        "shape/version",
      )
    },
  )
  test.each([
    "envelope",
    "context",
    "node",
    "owner",
    "evidence",
    "allocation",
    "group",
    "line",
  ])("rejects unknown fields at %s boundary", (boundary) => {
    const saved = encode()
    const changed = JSON.parse(JSON.stringify(saved))
    const target = {
      envelope: changed,
      context: changed.sourceSnapshot.context,
      node: changed.sourceSnapshot.nodes[0],
      owner: changed.sourceSnapshot.nodes[0].owner,
      evidence: changed.sourceSnapshot.evidence[0],
      allocation: changed.postingPlan.allocations[0],
      group: changed.postingPlan.groups[0],
      line: changed.postingPlan.groups[0].lines[0],
    }[boundary]
    target.requiresConfirmationProof = false
    reject(
      () => decodeReviewedCostConfirmationContract(changed, header(saved)),
      "shape/version",
    )
  })
  test.each([
    "tenantId",
    "bookId",
    "currencyCode",
    "reviewId",
    "actorUserId",
    "clientCommandId",
    "reason",
    "reviewedBookSequence",
    "historyThrough",
    "evidenceCutoff",
  ] as const)("requires exact held/persisted header %s", (field) => {
    const saved = encode()
    const expected = { ...header(saved), [field]: "different" }
    reject(() => decode(saved, expected), "held scope")
  })
  test.each([
    "algorithmVersion",
    "costTraceHash",
    "reviewedSnapshotHash",
  ] as const)("rejects changed persisted %s", (field) => {
    const saved = encode()
    const changed = { ...header(saved), [field]: h("e") }
    reject(
      () =>
        decodeReviewedCostConfirmationContract(
          saved,
          changed as ReviewedCostConfirmationExpectedHeader,
        ),
      "persisted header",
    )
  })
  test.each([
    "physicalSnapshotHash",
    "sourceDiscoveryHash",
    "owningSourceSnapshotHash",
    "returnSourceSnapshotHash",
    "assemblySnapshotHash",
    "repositorySourceSnapshotHash",
  ] as const)("binds original %s into paired hash", (key) => {
    const input = fixture()
    const saved = encode(input)
    input.sourceSnapshot.hashes[key] = h("0")
    const changed = encode(input)
    expect(changed.reviewedSnapshotHash).not.toBe(saved.reviewedSnapshotHash)
    reject(() => decode(changed, header(saved)), "persisted header")
  })
  test.each([
    "0",
    "00",
    "-1",
    "+1",
    "1.0",
    "1e3",
    "9223372036854775808",
    "100000000000000000000",
  ])("rejects invalid positive journal amount %s", (amount) => {
    const input = fixture()
    first(first(input.postingPlan.groups).lines).amountMinor = amount
    reject(() => encode(input))
  })
  test.each(["4.0", "04", "-4", "4e0", "4 ", "NaN"])(
    "requires canonical quantity %s",
    (quantity) => {
      const input = fixture()
      origin(input).quantity = quantity
      reject(() => encode(input))
    },
  )
  test("rejects numerical minor units, noncanonical timestamps, untrimmed identity and fractional revision", () => {
    const saved = encode()
    for (const change of [
      (raw: typeof saved) => {
        first(raw.sourceSnapshot.evidence).originalCostMinor =
          1001 as unknown as string
      },
      (raw: typeof saved) => {
        raw.sourceSnapshot.context.historyThrough = "2026-10-01T12:00:00Z"
      },
      (raw: typeof saved) => {
        first(raw.postingPlan.groups).sourceKind = " INVENTORY_COST_REVIEW"
      },
      (raw: typeof saved) => {
        first(raw.sourceSnapshot.pools).expectedStockRevision = 1.5
      },
    ]) {
      const changed = structuredClone(saved)
      change(changed)
      reject(() => decode(changed), "shape/version")
    }
  })
  test.each(["node", "evidence", "account", "allocation", "pool", "group"])(
    "rejects duplicate %s identities before accepting a rehashed plan",
    (kind) => {
      const input = fixture()
      if (kind === "node")
        input.sourceSnapshot.nodes.push(structuredClone(origin(input)))
      if (kind === "evidence")
        input.sourceSnapshot.evidence.push(
          structuredClone(first(input.sourceSnapshot.evidence)),
        )
      if (kind === "account")
        input.sourceSnapshot.accounts.push(
          structuredClone(first(input.sourceSnapshot.accounts)),
        )
      if (kind === "allocation")
        input.postingPlan.allocations.push(
          structuredClone(first(input.postingPlan.allocations)),
        )
      if (kind === "pool")
        input.sourceSnapshot.pools.push(
          structuredClone(first(input.sourceSnapshot.pools)),
        )
      if (kind === "group")
        input.postingPlan.groups.push(
          structuredClone(first(input.postingPlan.groups)),
        )
      reject(() => encode(input))
    },
  )
  test("strict decoder rejects noncanonical sets even with recomputed pair hashes", () => {
    const saved = encode()
    saved.sourceSnapshot.accounts.reverse()
    saved.postingPlan.sourceSnapshotHash = financePayloadHash(
      saved.sourceSnapshot,
    )
    saved.reviewedSnapshotHash = financePayloadHash({
      contractVersion: "reviewed-cost-confirmation-v1",
      sourceSnapshot: saved.sourceSnapshot,
      postingPlan: saved.postingPlan,
    })
    reject(() => decode(saved), "noncanonical")
  })
  test("tampered ordered lines fail actual writer fingerprint after rehashing outer JSON", () => {
    const saved = encode()
    first(saved.postingPlan.groups).lines.reverse()
    saved.reviewedSnapshotHash = financePayloadHash({
      contractVersion: "reviewed-cost-confirmation-v1",
      sourceSnapshot: saved.sourceSnapshot,
      postingPlan: saved.postingPlan,
    })
    reject(() => decode(saved), "ordered writer fingerprint")
  })
  test("rejects changed pair linkage even when held header matches attacker-selected outer hash", () => {
    const saved = encode()
    saved.postingPlan.sourceSnapshotHash = h("e")
    saved.reviewedSnapshotHash = financePayloadHash({
      contractVersion: "reviewed-cost-confirmation-v1",
      sourceSnapshot: saved.sourceSnapshot,
      postingPlan: saved.postingPlan,
    })
    reject(() => decode(saved), "pair hash")
  })
  test("UNKNOWN difference cannot become assumed zero or resolved-minus-zero", () => {
    for (const changed of ["0", "1001"]) {
      const input = fixture()
      first(input.postingPlan.allocations).differenceMinor = changed
      reject(() => encode(input), "UNKNOWN difference")
    }
  })
  test("original recorded cost correction retains exact signed difference", () => {
    const input = fixture()
    origin(input).recordedCostMinor = "1200"
    first(input.sourceSnapshot.evidence).mode = "CORRECT_RECORDED"
    first(input.postingPlan.allocations).differenceMinor = "-199"
    const saved = encode(input)
    expect(
      saved.postingPlan.allocations.find(
        (a) => a.sourceKey === "movement:opening",
      )?.differenceMinor,
    ).toBe("-199")
    expect(
      saved.sourceSnapshot.nodes.find((n) => n.sourceKey === "movement:opening")
        ?.recordedCostMinor,
    ).toBe("1200")
  })
  test("refuses unresolved originals and missing consumed history", () => {
    const missing = fixture()
    missing.sourceSnapshot.evidence = []
    reject(() => encode(missing), "missing original cost")
    const skipped = fixture()
    skipped.sourceSnapshot.nodes.shift()
    skipped.sourceSnapshot.evidence = []
    reject(() => encode(skipped))
  })
  test("retains fully consumed original history rather than dropping zero-ending pool", () => {
    const input = fixture()
    issue(input).quantity = "4"
    issue(input).quantityAfter = "0"
    first(input.sourceSnapshot.pools).endingQuantity = "0"
    const allocation = input.postingPlan.allocations[1]
    if (!allocation) throw new Error("Missing issue")
    allocation.resolvedCostMinor = "1001"
    first(input.postingPlan.pools).resolvedValueMinor = "0"
    const saved = encode(input)
    expect(saved.sourceSnapshot.nodes).toHaveLength(2)
    expect(first(saved.postingPlan.pools).resolvedValueMinor).toBe("0")
    expect(decode(saved).requiresConfirmationProof).toBe(true)
  })
  test("preserves a real recorded zero without converting UNKNOWN to zero", () => {
    const input = fixture()
    input.sourceSnapshot.nodes = [origin(input)]
    origin(input).quantity = "0"
    origin(input).quantityAfter = "0"
    origin(input).recordedCostMinor = "0"
    input.sourceSnapshot.evidence = []
    first(input.sourceSnapshot.pools).endingQuantity = "0"
    first(input.sourceSnapshot.pools).recordedValueMinor = "0"
    input.postingPlan.allocations = [
      {
        sourceKey: "movement:opening",
        resolvedCostMinor: "0",
        differenceMinor: "0",
        classification: "UNCLASSIFIED",
        classificationBasisHash: null,
        evidenceId: null,
        monetaryTreatment: "NO_MONETARY_EFFECT",
        groupKeys: [],
        originalJournalEntryId: null,
      },
    ]
    input.postingPlan.groups = []
    first(input.postingPlan.pools).resolvedValueMinor = "0"
    const saved = encode(input)
    expect(first(saved.sourceSnapshot.nodes).recordedCostMinor).toBe("0")
    expect(first(saved.postingPlan.allocations).differenceMinor).toBe("0")
    expect(decode(saved).requiresConfirmationProof).toBe(true)
  })
  test.each([
    "resolved",
    "ending",
    "missingAllocation",
    "extraPool",
    "ownerDate",
    "physicalIdentity",
    "purpose",
    "optionalDependency",
  ])("refuses changed canonical calculator/identity fact %s", (kind) => {
    const input = fixture()
    if (kind === "resolved")
      first(input.postingPlan.allocations).resolvedCostMinor = "1002"
    if (kind === "ending")
      first(input.postingPlan.pools).resolvedValueMinor = "752"
    if (kind === "missingAllocation") input.postingPlan.allocations.pop()
    if (kind === "extraPool")
      input.postingPlan.pools.push({
        balanceSourceId: "borrowed",
        resolvedValueMinor: "0",
      })
    if (kind === "ownerDate") origin(input).owner.effectiveAt = cutoff
    if (kind === "physicalIdentity") origin(input).stockMovementId = "borrowed"
    if (kind === "purpose") origin(input).withdrawalPurpose = "PRODUCT_ISSUE"
    if (kind === "optionalDependency") origin(input).returnOrdinal = "1"
    reject(() => encode(input))
  })
  test.each([
    "missing",
    "crossed",
    "selfReview",
    "unused",
    "poolMissing",
    "poolCrossed",
    "poolSelf",
    "poolUnused",
  ])("refuses prior dependency %s", (kind) => {
    const input = prior(fixture())
    if (kind === "missing") input.sourceSnapshot.priorResolutions = []
    if (kind === "crossed")
      first(input.sourceSnapshot.priorResolutions).sourceKey = "movement:issue"
    if (kind === "selfReview")
      first(input.sourceSnapshot.priorResolutions).reviewId = "review"
    if (kind === "unused") origin(input).previousResolutionId = null
    if (kind === "poolMissing") input.sourceSnapshot.priorPoolSnapshots = []
    if (kind === "poolCrossed")
      first(input.sourceSnapshot.priorPoolSnapshots).poolId = "crossed"
    if (kind === "poolSelf")
      first(input.sourceSnapshot.priorPoolSnapshots).reviewId = "review"
    if (kind === "poolUnused")
      first(input.sourceSnapshot.pools).lastCostReviewSnapshotId = null
    reject(() => encode(input))
  })
  test("valid prior manifests bind topology and journal proof identities without claiming acceptance", () => {
    const input = prior(fixture())
    const saved = encode(input)
    first(input.sourceSnapshot.priorResolutions).journalFactsHash = h("f")
    first(input.sourceSnapshot.priorPoolSnapshots).journalFactsHash = h("f")
    expect(encode(input).reviewedSnapshotHash).not.toBe(
      saved.reviewedSnapshotHash,
    )
    expect(decode(saved).requiresAcceptedPriorProof).toBe(true)
  })
  test.each([
    "book",
    "watermark",
    "missing",
    "duplicateSequence",
    "duplicateCommand",
    "zeroSequence",
  ])("refuses original posted journal descriptor %s", (kind) => {
    const input = journal(fixture())
    const j = first(input.sourceSnapshot.originalJournals)
    if (kind === "book") j.bookId = "other-book"
    if (kind === "watermark") j.sequence = "8"
    if (kind === "missing") input.sourceSnapshot.originalJournals = []
    if (kind === "duplicateSequence")
      input.sourceSnapshot.originalJournals.push({
        ...j,
        entryId: "another",
        clientCommandId: "another-command",
      })
    if (kind === "duplicateCommand")
      input.sourceSnapshot.originalJournals.push({
        ...j,
        entryId: "another",
        sequence: "6",
      })
    if (kind === "zeroSequence") j.sequence = "0"
    reject(() => encode(input))
  })
  test.each([
    "missingClass",
    "classChange",
    "basisChange",
    "evidenceChange",
    "extraEvidence",
    "missingEvidence",
    "missingGroup",
    "extraGroup",
    "duplicateMember",
    "unclassifiedProposed",
    "classifiedNoBasis",
    "noMonetaryNonzero",
    "missingOriginal",
  ])("refuses monetary ownership/classification mismatch %s", (kind) => {
    const input = fixture()
    const a = first(input.postingPlan.allocations)
    const g = first(input.postingPlan.groups)
    if (kind === "missingClass") g.classifications = []
    if (kind === "classChange")
      first(g.classifications).classification = "OPENING_BALANCE"
    if (kind === "basisChange") first(g.classifications).basisHash = h("e")
    if (kind === "evidenceChange") first(g.classifications).evidenceId = null
    if (kind === "extraEvidence") g.evidenceIds.push("borrowed")
    if (kind === "missingEvidence") g.evidenceIds = []
    if (kind === "missingGroup") input.postingPlan.groups = []
    if (kind === "extraGroup") a.groupKeys.push("borrowed")
    if (kind === "duplicateMember") g.allocationSourceKeys.push(a.sourceKey)
    if (kind === "unclassifiedProposed") a.classification = "UNCLASSIFIED"
    if (kind === "classifiedNoBasis") a.classificationBasisHash = null
    if (kind === "noMonetaryNonzero") {
      a.monetaryTreatment = "NO_MONETARY_EFFECT"
      a.groupKeys = []
      input.postingPlan.groups = []
    }
    if (kind === "missingOriginal") {
      a.monetaryTreatment = "UNCHANGED_POSTED"
      a.groupKeys = []
      input.postingPlan.groups = []
    }
    reject(() => encode(input))
  })
  test.each([
    "crossedAccount",
    "missingAccount",
    "borrowedCounterpart",
    "actor",
    "imbalance",
    "tooLarge",
    "singleLine",
    "tooManyLines",
    "reversal",
  ])("refuses journal group %s", (kind) => {
    const input = fixture()
    const g = first(input.postingPlan.groups)
    if (kind === "crossedAccount")
      first(input.sourceSnapshot.accounts).bookId = "other-book"
    if (kind === "missingAccount") first(g.lines).accountId = "missing"
    if (kind === "borrowedCounterpart")
      first(input.sourceSnapshot.evidence).counterAccountId = "missing"
    if (kind === "actor") g.actorUserId = "different-reviewer"
    if (kind === "imbalance") first(g.lines).amountMinor = "1002"
    if (kind === "tooLarge")
      for (const line of g.lines) line.amountMinor = "100000000000001"
    if (kind === "singleLine") g.lines.pop()
    if (kind === "tooManyLines")
      g.lines = Array.from({ length: 102 }, (_, i) => ({
        accountId: i % 2 ? "capital" : "inventory",
        side: i % 2 ? "CREDIT" : "DEBIT",
        amountMinor: "1",
        description: null,
      }))
    if (kind === "reversal") g.reversalOfId = "missing-original"
    reject(() => encode(input))
  })
  test("decoder and encoder results are detached from mutable caller references", () => {
    const input = fixture()
    const saved = encode(input)
    const result = decode(saved)
    input.sourceSnapshot.context.reason = "mutated input"
    saved.sourceSnapshot.context.reason = "mutated saved"
    expect(result.saved.sourceSnapshot.context.reason).toBe(
      "Documented original cost",
    )
  })
  test.each(["RETURN_RESTOCK", "RETURN_NON_RESTOCK", "RESTORATION"] as const)(
    "preserves exact original %s dependency and recovery amount",
    (kind) => {
      const saved = encode(returned(kind))
      const dependency = saved.sourceSnapshot.nodes.find(
        (node) => node.kind === kind,
      )
      expect(dependency?.originalSourceKey).toBe("movement:issue")
      expect(dependency?.originalRemainingQuantityBefore).toBe("1")
      expect(
        saved.postingPlan.allocations.find(
          (a) => a.sourceKey === dependency?.sourceKey,
        )?.resolvedCostMinor,
      ).toBe("250")
      expect(decode(saved).requiresPostedJournalOwnershipProof).toBe(true)
    },
  )
  test.each([
    "missingOriginal",
    "crossedOriginal",
    "residual",
    "ordinal",
    "borrowedPhysical",
    "missingPhysical",
    "identity",
    "cycle",
  ])("refuses original return dependency %s", (kind) => {
    const input = returned(
      kind === "borrowedPhysical" ? "RETURN_NON_RESTOCK" : "RETURN_RESTOCK",
    )
    const node = input.sourceSnapshot.nodes[2]
    if (!node) throw new Error("Missing return")
    if (kind === "missingOriginal") node.originalSourceKey = null
    if (kind === "crossedOriginal") node.originalSourceKey = "movement:opening"
    if (kind === "residual") node.originalRemainingQuantityBefore = "2"
    if (kind === "ordinal") node.returnOrdinal = "2"
    if (kind === "borrowedPhysical") node.valuationEventId = "borrowed-event"
    if (kind === "missingPhysical") node.stockMovementId = null
    if (kind === "identity") node.productReturnAllocationId = "borrowed"
    if (kind === "cycle") node.originalSourceKey = node.sourceKey
    reject(() => encode(input))
  })
  test("refuses borrowing a physical movement under a second return key", () => {
    const input = returned("RETURN_RESTOCK")
    const node = input.sourceSnapshot.nodes[2]
    if (!node) throw new Error("Missing return")
    node.stockMovementId = "opening"
    reject(() => encode(input), "duplicate identities")
  })
  test("source snapshot binds accepted-prior amounts while the proposed journal retains its exact declared delta", () => {
    const input = prior(fixture())
    for (const line of first(input.postingPlan.groups).lines)
      line.amountMinor = "1"
    const saved = encode(input)
    expect(first(saved.sourceSnapshot.priorResolutions).resolvedCostMinor).toBe(
      "1000",
    )
    expect(
      first(saved.postingPlan.groups).lines.map((line) => line.amountMinor),
    ).toEqual(["1", "1"])
    expect(decode(saved).requiresEvidenceClassificationProof).toBe(true)
    first(input.sourceSnapshot.priorResolutions).resolvedCostMinor = "999"
    expect(encode(input).reviewedSnapshotHash).not.toBe(
      saved.reviewedSnapshotHash,
    )
  })
  test("rejects conflicting fingerprints for the same prior review header", () => {
    const input = prior(fixture())
    first(input.sourceSnapshot.priorPoolSnapshots).reviewedSnapshotHash = h("a")
    reject(() => encode(input), "header fingerprints")
  })
  test.each(["priorResolutions", "priorPoolSnapshots"] as const)(
    "strict decoder refuses unversioned prior dependency %s",
    (key) => {
      const saved = encode(prior(fixture()))
      const raw = JSON.parse(JSON.stringify(saved))
      raw.sourceSnapshot[key][0].contractVersion = undefined
      reject(
        () => decodeReviewedCostConfirmationContract(raw, header(saved)),
        "shape/version",
      )
    },
  )
  test("preserves complete reciprocal reversal descriptors without claiming actual posted-line proof", () => {
    const input = journal(fixture())
    const original = first(input.sourceSnapshot.originalJournals)
    original.sequence = "6"
    original.reversalId = "reversal"
    input.sourceSnapshot.originalJournals.push({
      ...original,
      entryId: "reversal",
      sequence: "7",
      clientCommandId: "reverse-command",
      reversalId: null,
      reversalOfId: original.entryId,
    })
    const saved = encode(input)
    expect(saved.sourceSnapshot.originalJournals).toHaveLength(2)
    expect(decode(saved).requiresPostedJournalOwnershipProof).toBe(true)
  })
  test.each([
    "missing",
    "notReciprocal",
    "reverseOrder",
    "self",
    "reverseOfReverse",
    "recordedDate",
    "effectiveDate",
    "extendedYear",
    "store",
  ])("refuses reversal descriptor closure %s", (kind) => {
    const input = journal(fixture())
    const original = first(input.sourceSnapshot.originalJournals)
    original.sequence = "6"
    original.reversalId = "reversal"
    const reversal = {
      ...original,
      entryId: "reversal",
      sequence: "7",
      clientCommandId: "reverse-command",
      reversalId: null,
      reversalOfId: original.entryId,
    }
    input.sourceSnapshot.originalJournals.push(reversal)
    if (kind === "missing") input.sourceSnapshot.originalJournals.pop()
    if (kind === "notReciprocal") reversal.reversalOfId = "missing"
    if (kind === "reverseOrder") {
      original.sequence = "7"
      reversal.sequence = "6"
    }
    if (kind === "self") original.reversalId = original.entryId
    if (kind === "reverseOfReverse") original.reversalOfId = reversal.entryId
    if (kind === "recordedDate") reversal.recordedAt = date
    if (kind === "effectiveDate")
      reversal.effectiveAt = "2026-09-30T12:00:00.000Z"
    if (kind === "extendedYear")
      original.effectiveAt = "+010000-01-01T00:00:00.000Z"
    if (kind === "store") reversal.storeId = "crossed-store"
    reject(() => encode(input))
  })
  test("preflight refuses aggregate plan reference overflow before parsing or calculator work", () => {
    const saved = encode()
    const raw = JSON.parse(JSON.stringify(saved))
    raw.postingPlan.groups[0].allocationSourceKeys =
      Array(32769).fill("movement:opening")
    reject(
      () => decodeReviewedCostConfirmationContract(raw, header(saved)),
      "bounded references",
    )
  })
  test("preflight refuses aggregate line and allocation membership overflow", () => {
    const input = fixture()
    first(input.postingPlan.groups).lines = Array.from({ length: 32769 }, () =>
      structuredClone(first(first(fixture().postingPlan.groups).lines)),
    )
    reject(() => encode(input), "bounded references/lines")
    const memberships = fixture()
    first(memberships.postingPlan.allocations).groupKeys =
      Array(32769).fill("origin")
    reject(() => encode(memberships), "bounded memberships")
  })
  test.each(["nodes", "pools", "groups"])(
    "refuses oversized %s without truncated success",
    (kind) => {
      const input = fixture()
      if (kind === "nodes")
        input.sourceSnapshot.nodes = Array.from({ length: 4097 }, () =>
          structuredClone(origin(input)),
        )
      if (kind === "pools")
        input.sourceSnapshot.pools = Array.from({ length: 129 }, () =>
          structuredClone(first(input.sourceSnapshot.pools)),
        )
      if (kind === "groups")
        input.postingPlan.groups = Array.from({ length: 4097 }, () =>
          structuredClone(first(input.postingPlan.groups)),
        )
      reject(() => encode(input), "shape/version")
    },
  )
})
