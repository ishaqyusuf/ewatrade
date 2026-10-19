import { expect, spyOn, test } from "bun:test"
import { Prisma } from "../../generated/prisma/client"
import {
  CommerceQuoteDecisionReviewUnavailableError,
  prepareReviewedQuoteDecisionInTransaction,
} from "./commerce-quote-decision-review"
import {
  getCommerceQuoteApprovalReadOnlyInTransaction,
  rejectCommerceQuoteVersionInTransaction,
} from "./commerce-quotes"
import {
  decision,
  decisionScope,
  fixture,
} from "./test-helpers/commerce-quote-decision"

function input(
  row: ReturnType<typeof decision>,
  choice: "approve" | "reject" = "reject",
) {
  return {
    ...decisionScope,
    approvalId: row.id,
    quoteId: row.quoteId,
    quoteVersionId: row.quoteVersionId,
    decision: choice,
    reason: "Original stated reason",
  }
}

function completeDecision(
  optionCount = 20,
  lineCount = 100,
  lineNote = "Complete saved line note",
) {
  const base = decision()
  const option = base.quoteVersion.options[0]
  const line = option?.lines[0]
  if (!option || !line)
    throw Error("The canonical fixture requires its original option and line")
  return {
    ...base,
    quoteVersion: {
      ...base.quoteVersion,
      clientVersionId: "server-generated-version",
      totalMinor: 1000 * lineCount,
      customerNote: "Original version note",
      fulfilmentPromise: "Original version promise",
      createdAt: new Date("2026-01-01T00:00:00Z"),
      providerSecret: "withheld fixture field",
      options: Array.from({ length: optionCount }, (_, optionIndex) => ({
        ...option,
        clientOptionId: `server-generated-option-${optionIndex}`,
        id: `option-${optionIndex}`,
        position: optionIndex,
        currencyCode: "NGN",
        customerNote: `Option ${optionIndex} original note`,
        fulfilmentPromise: `Option ${optionIndex} original promise`,
        subtotalMinor: 1000 * lineCount,
        totalMinor: 1000 * lineCount,
        lines: Array.from({ length: lineCount }, (_, lineIndex) => ({
          ...line,
          id: `line-${optionIndex}-${lineIndex}`,
          customerNote: lineNote,
          optionSelections: [{ group: "Size", value: "Original large" }],
          catalogSuggestedUnitPriceMinor: 950,
          catalogPriceOverride: true,
          catalogPriceSuggestionEffectiveAt: new Date("2025-12-01T00:00:00Z"),
          createdAt: new Date("2026-01-01T00:00:00Z"),
        })),
      })),
    },
  }
}

test("full native20×100 quotation retains every saved business field, note and promise without provider or write", async () => {
  const row = completeDecision()
  const f = fixture([row])
  const prepared = await prepareReviewedQuoteDecisionInTransaction(
    f.tx,
    input(row, "approve"),
  )
  expect(prepared.review.detail.options).toHaveLength(20)
  expect(prepared.review.releaseText).toHaveLength(20)
  for (let index = 0; index < 20; index++) {
    expect(prepared.review.detail.options[index]?.lines).toHaveLength(100)
    expect(prepared.review.releaseText[index]?.lineNotes).toHaveLength(100)
    expect(prepared.review.releaseText[index]?.customerNote).toBe(
      `Option ${index} original note`,
    )
    expect(prepared.review.releaseText[index]?.fulfilmentPromise).toBe(
      `Option ${index} original promise`,
    )
  }
  expect(prepared.review.originalVersion).toMatchObject({
    id: row.quoteVersionId,
    customerNote: "Original version note",
    fulfilmentPromise: "Original version promise",
    createdAt: "2026-01-01T00:00:00.000Z",
    totalMinor: 100_000,
  })
  expect(prepared.review.originalVersion.options[19]?.lines[99]).toMatchObject({
    id: "line-19-99",
    quantity: "1",
    unitPriceMinor: 1000,
    catalogSuggestedUnitPriceMinor: 950,
    catalogPriceOverride: true,
    catalogPriceSuggestionEffectiveAt: "2025-12-01T00:00:00.000Z",
    optionSelections: [{ group: "Size", value: "Original large" }],
    customerNote: "Complete saved line note",
  })
  expect(prepared.review.originalVersion).not.toHaveProperty("providerSecret")
  expect(prepared.review.originalVersion).not.toHaveProperty(
    "acceptanceTokenDigest",
  )
  expect(prepared.review.originalVersion).not.toHaveProperty("clientVersionId")
  expect(prepared.review.originalVersion.options[0]).not.toHaveProperty(
    "clientOptionId",
  )
  expect(f.writes).toEqual([])
})

test("generated replay IDs stay private in display while each remains bound to the complete digest", async () => {
  const row = completeDecision(1, 1)
  const f = fixture([row])
  const first = await prepareReviewedQuoteDecisionInTransaction(
    f.tx,
    input(row, "approve"),
  )
  row.quoteVersion.clientVersionId = "changed-server-version"
  const versionChanged = await prepareReviewedQuoteDecisionInTransaction(
    f.tx,
    input(row, "approve"),
  )
  expect(versionChanged.target.revision).not.toBe(first.target.revision)
  const option = row.quoteVersion.options[0]
  if (!option) throw Error("Keep the original option")
  option.clientOptionId = "changed-server-option"
  const optionChanged = await prepareReviewedQuoteDecisionInTransaction(
    f.tx,
    input(row, "approve"),
  )
  expect(optionChanged.target.revision).not.toBe(versionChanged.target.revision)
  for (const review of [
    first.review,
    versionChanged.review,
    optionChanged.review,
  ]) {
    expect(review.originalVersion).not.toHaveProperty("clientVersionId")
    expect(review.originalVersion.options[0]).not.toHaveProperty(
      "clientOptionId",
    )
  }
  expect(f.writes).toEqual([])
})

test("record key insertion order and linked-set order do not change the canonical decision digest", async () => {
  const row = completeDecision(2, 2)
  const f = fixture([row])
  f.state.linkedConversations = [
    { conversationId: "second" },
    { conversationId: "first" },
  ]
  const first = await prepareReviewedQuoteDecisionInTransaction(
    f.tx,
    input(row, "approve"),
  )
  function reverseKeys(value: object) {
    const entries = Object.entries(value).reverse()
    for (const [key] of entries) Reflect.deleteProperty(value, key)
    for (const [key, entry] of entries) Reflect.set(value, key, entry)
  }
  reverseKeys(row.quoteVersion)
  for (const option of row.quoteVersion.options) {
    reverseKeys(option)
    for (const line of option.lines) {
      reverseKeys(line)
      for (const selection of line.optionSelections) reverseKeys(selection)
    }
  }
  f.state.linkedConversations.reverse()
  const reordered = await prepareReviewedQuoteDecisionInTransaction(
    f.tx,
    input(row, "approve"),
  )
  expect(reordered.target).toEqual(first.target)
  expect(reordered.review.effects.conversationIds).toEqual(["first", "second"])
  expect(f.writes).toEqual([])
})

test("final option/line business changes and semantic dates remain digest-bound without clipping", async () => {
  const row = completeDecision()
  const f = fixture([row])
  const previous = await prepareReviewedQuoteDecisionInTransaction(
    f.tx,
    input(row, "approve"),
  )
  const lastOption = row.quoteVersion.options.at(-1)
  const lastLine = lastOption?.lines.at(-1)
  if (!lastOption || !lastLine)
    throw Error("Keep the complete final option and line")
  lastLine.customerNote = "Changed final line note"
  const changed = await prepareReviewedQuoteDecisionInTransaction(
    f.tx,
    input(row, "approve"),
  )
  expect(changed.target.revision).not.toBe(previous.target.revision)
  lastOption.fulfilmentPromise = "Changed final promise"
  const promise = await prepareReviewedQuoteDecisionInTransaction(
    f.tx,
    input(row, "approve"),
  )
  expect(promise.target.revision).not.toBe(changed.target.revision)
  lastLine.catalogPriceSuggestionEffectiveAt = new Date("2025-12-02T00:00:00Z")
  const dated = await prepareReviewedQuoteDecisionInTransaction(
    f.tx,
    input(row, "approve"),
  )
  expect(dated.target.revision).not.toBe(promise.target.revision)
  expect(f.writes).toEqual([])
})

test("saved Decimal(38,6) quantity is copied as an exact plain string without floating conversion", async () => {
  const row = completeDecision(1, 1)
  const line = row.quoteVersion.options[0]?.lines[0]
  const option = row.quoteVersion.options[0]
  if (!line || !option) throw Error("Keep the original line")
  const quantity = "12345678901234567890123456789012.123456"
  line.quantity = new Prisma.Decimal(quantity)
  line.unitPriceMinor = 0
  line.totalMinor = 0
  option.subtotalMinor = 0
  option.totalMinor = 0
  row.quoteVersion.totalMinor = 0
  const f = fixture([row])
  const result = await prepareReviewedQuoteDecisionInTransaction(
    f.tx,
    input(row, "approve"),
  )
  expect(result.review.originalVersion.options[0]?.lines[0]?.quantity).toBe(
    quantity,
  )
  expect(f.writes).toEqual([])
})

test("native shape overflow refuses the whole review rather than returning a smaller confirmable quotation", async () => {
  for (const row of [completeDecision(21, 1), completeDecision(1, 101)]) {
    const f = fixture([row])
    await expect(
      prepareReviewedQuoteDecisionInTransaction(f.tx, input(row, "approve")),
    ).rejects.toMatchObject({
      name: "CommerceQuoteDecisionReviewUnavailableError",
      reason: "complete_review_unsupported",
    })
    expect(f.writes).toEqual([])
  }
})

test("101 links, duplicate or missing link identities refuse complete approval; none are clipped or deduplicated", async () => {
  for (const links of [
    Array.from({ length: 101 }, (_, i) => ({ conversationId: `chat-${i}` })),
    [{ conversationId: "same" }, { conversationId: "same" }],
    [{ conversationId: "" }],
    [{ conversationId: " untrimmed " }],
  ]) {
    const row = decision()
    const f = fixture([row])
    f.state.linkedConversations = links
    await expect(
      prepareReviewedQuoteDecisionInTransaction(f.tx, input(row, "approve")),
    ).rejects.toBeInstanceOf(CommerceQuoteDecisionReviewUnavailableError)
    const count = f.reads.filter((read) => read.table === "links").length
    const rejected = await prepareReviewedQuoteDecisionInTransaction(
      f.tx,
      input(row, "reject"),
    )
    expect(rejected.review.effects.conversationIds).toEqual([])
    expect(f.reads.filter((read) => read.table === "links")).toHaveLength(count)
    expect(f.writes).toEqual([])
  }
})

test("oversize complete escaped-text document refuses before digest serialization, with no effects", async () => {
  // Reused small strings make >64MiB logical escaped JSON across complete
  // original/review/release facts without allocating the giant serialized body.
  const row = completeDecision(20, 100, "\u0001".repeat(2000))
  Object.defineProperty(row.quoteVersion, "beforeBudgetSortSentinel", {
    enumerable: true,
    value: true,
  })
  const f = fixture([row])
  const stringify = JSON.stringify
  let completeSerializations = 0
  let semanticSorts = 0
  const sort = Array.prototype.sort
  const sortSpy = spyOn(Array.prototype, "sort").mockImplementation(function (
    this: unknown[],
    compare,
  ) {
    if (
      this.some(
        (entry) =>
          entry === "beforeBudgetSortSentinel" ||
          (Array.isArray(entry) && entry[0] === "beforeBudgetSortSentinel"),
      )
    )
      semanticSorts++
    return Reflect.apply(sort, this, [compare])
  })
  const spy = spyOn(JSON, "stringify").mockImplementation(
    (value, replacer, space) => {
      if (
        value === "beforeBudgetSortSentinel" ||
        (value &&
          typeof value === "object" &&
          Object.hasOwn(value, "review") &&
          Object.hasOwn(value, "originalVersion"))
      )
        completeSerializations++
      return Reflect.apply(stringify, JSON, [value, replacer, space])
    },
  )
  try {
    await expect(
      prepareReviewedQuoteDecisionInTransaction(f.tx, input(row, "approve")),
    ).rejects.toMatchObject({
      name: "CommerceQuoteDecisionReviewUnavailableError",
      reason: "complete_review_too_large",
      message:
        "The complete quotation review is unavailable. Keep the quotation unchanged.",
    })
    expect(completeSerializations).toBe(0)
    expect(semanticSorts).toBe(0)
    expect(f.writes).toEqual([])
  } finally {
    spy.mockRestore()
    sortSpy.mockRestore()
  }
})

test("snapshot admission never invokes custom JSON, getter or Decimal instance callbacks", async () => {
  for (const kind of ["toJSON", "getter", "decimal"]) {
    const row = decision()
    const f = fixture([row])
    let callbacks = 0
    const version = { ...row.quoteVersion }
    if (kind === "toJSON")
      Object.defineProperty(version, "toJSON", {
        enumerable: true,
        value() {
          callbacks++
          return {}
        },
      })
    if (kind === "getter")
      Object.defineProperty(version, "customerNote", {
        enumerable: true,
        get() {
          callbacks++
          return "private"
        },
      })
    if (kind === "decimal") {
      const quantity = new Prisma.Decimal(1)
      Object.defineProperty(quantity, "toJSON", {
        value() {
          callbacks++
          return "1"
        },
      })
      version.options = version.options.map((option) => ({
        ...option,
        lines: option.lines.map((line) => ({ ...line, quantity })),
      }))
    }
    // Alter only the subsequent saved-version transport row. The preceding
    // canonical authority/detail query still runs against the real fixture.
    Reflect.set(f.tx.commerceQuoteVersion, "findFirst", () => version)
    await expect(
      prepareReviewedQuoteDecisionInTransaction(f.tx, input(row, "approve")),
    ).rejects.toMatchObject({ reason: "complete_review_unsupported" })
    expect(callbacks).toBe(0)
    expect(f.writes).toEqual([])
  }
})

test("pure approval review binds exact saved version, commercial release and linked-effect set without screening or writes", async () => {
  const row = decision()
  const f = fixture([row])
  const first = await prepareReviewedQuoteDecisionInTransaction(
    f.tx,
    input(row, "approve"),
  )
  expect(first.target.id).toBe(row.id)
  expect(first.review.effects).toMatchObject({
    issueVersion: true,
    createPublicAcceptanceCapability: true,
    sourceIssuedFacts: true,
    decisionAudit: true,
    linkedConversationCount: 0,
    textScreening: "required_by_native_execution_not_checked",
    providerDelivery: "not_checked",
  })
  expect(f.writes).toEqual([])
  f.state.linkedConversations = [{ conversationId: "existing-chat" }]
  const second = await prepareReviewedQuoteDecisionInTransaction(
    f.tx,
    input(row, "approve"),
  )
  expect(second.target.revision).not.toBe(first.target.revision)
  expect(second.review.effects.linkedConversationCount).toBe(1)
  expect(f.writes).toEqual([])
})

test("prepared rejection preserves native eligibility when stock is unavailable; ordinary read behavior remains unchanged", async () => {
  const row = decision()
  const f = fixture([row])
  f.state.product = true
  const ordinary = await getCommerceQuoteApprovalReadOnlyInTransaction(
    f.tx,
    input(row),
  )
  expect(ordinary.currentReview.stale).toBe(true)
  expect(ordinary.actions.canReject).toBe(false)
  const offeringReads = f.reads.filter(
    (read) => read.table === "offering",
  ).length
  const prepared = await prepareReviewedQuoteDecisionInTransaction(
    f.tx,
    input(row),
  )
  expect(prepared.review.detail.actions.canReject).toBe(true)
  expect(prepared.review.effects.issueVersion).toBe(false)
  expect(f.reads.filter((read) => read.table === "offering").length).toBe(
    offeringReads,
  )
  expect(f.writes).toEqual([])
})

test("already-quoted sources do not fabricate a fresh source transition in the approval review", async () => {
  const row = decision()
  const f = fixture([row])
  f.state.sourceStatus = "QUOTED"
  const prepared = await prepareReviewedQuoteDecisionInTransaction(
    f.tx,
    input(row, "approve"),
  )
  expect(prepared.review.sourceState).toBe("QUOTED")
  expect(prepared.review.effects.sourceIssuedFacts).toBe(false)
  expect(prepared.review.effects.issueVersion).toBe(true)
  expect(f.writes).toEqual([])
})

test("maker-checker, active selected approver and current policy/version are required for both decisions", async () => {
  for (const choice of ["approve", "reject"] as const) {
    for (const alteration of [
      "maker",
      "revoked",
      "policy",
      "version",
      "expired",
    ] as const) {
      const row = decision()
      const f = fixture([row])
      if (alteration === "maker") row.requesterMembershipId = "checker"
      if (alteration === "revoked") f.state.assigned = false
      if (alteration === "policy") f.state.policyRevision += 1
      if (alteration === "version")
        row.quote.currentVersionId = "different-version"
      if (alteration === "expired")
        row.quoteVersion.expiresAt = new Date("2000-01-01T00:00:00Z")
      await expect(
        prepareReviewedQuoteDecisionInTransaction(f.tx, input(row, choice)),
      ).rejects.toThrow()
      expect(f.writes).toEqual([])
      expect(row.status).toBe("PENDING")
    }
  }
})

test("foreign original identity, revoked scoped Store grant and prescription/pharmacy sources refuse without reconciliation", async () => {
  for (const alteration of [
    "approval",
    "quote",
    "tuple-version",
    "scope",
    "prescription",
    "pharmacy",
  ] as const) {
    const row = decision()
    const f = fixture([row])
    const request = input(row)
    if (alteration === "approval") request.approvalId = "foreign-approval"
    if (alteration === "quote") request.quoteId = "foreign-quote"
    if (alteration === "tuple-version")
      request.quoteVersionId = "foreign-version"
    if (alteration === "scope") {
      f.state.scoped = true
      f.state.storeGranted = false
    }
    if (alteration === "prescription") row.sourceType = "PRESCRIPTION_REQUEST"
    if (alteration === "pharmacy") row.sourceType = "COMMERCE_INQUIRY"
    await expect(
      prepareReviewedQuoteDecisionInTransaction(f.tx, request),
    ).rejects.toThrow()
    expect(f.writes).toEqual([])
    expect(row.status).toBe("PENDING")
  }
})

test("release preview includes all100 linked conversations; rejection does not consult release links", async () => {
  const row = decision()
  const f = fixture([row])
  f.state.linkedConversations = Array.from({ length: 100 }, (_, i) => ({
    conversationId: `chat-${i}`,
  }))
  const approved = await prepareReviewedQuoteDecisionInTransaction(
    f.tx,
    input(row, "approve"),
  )
  expect(approved.review.effects.conversationIds).toEqual(
    f.state.linkedConversations.map((link) => link.conversationId).sort(),
  )
  expect(approved.review.effects.linkedConversationCount).toBe(100)
  expect(f.reads.find((read) => read.table === "links")?.input).toEqual({
    distinct: ["conversationId"],
    select: { conversationId: true },
    take: 101,
    where: {
      tenantId: decisionScope.tenantId,
      storeId: decisionScope.storeId,
      sourceId: row.sourceId,
      kind: "SERVICE_REQUEST",
    },
  })
  const count = f.reads.filter((read) => read.table === "links").length
  const rejected = await prepareReviewedQuoteDecisionInTransaction(
    f.tx,
    input(row),
  )
  expect(rejected.review.effects.linkedConversationCount).toBe(0)
  expect(f.reads.filter((read) => read.table === "links").length).toBe(count)
  expect(f.writes).toEqual([])
})

test("caller-owned rejection writes the original stored decision once; exact native replay preserves its times and changed input refuses", async () => {
  const row = decision()
  const f = fixture([row], true)
  const prepared = await prepareReviewedQuoteDecisionInTransaction(
    f.tx,
    input(row),
  )
  const original = await prepared.execute("server-command")
  expect(original).toMatchObject({
    approvalId: row.id,
    quoteId: row.quoteId,
    quoteVersionId: row.quoteVersionId,
    decision: "rejected",
    releaseState: "rejected",
    decidedByMembershipId: "checker",
    reason: "Original stated reason",
  })
  if (!row.decidedAt)
    throw Error("Native rejection must record its original decision time.")
  expect(original.decidedAt).toBe(row.decidedAt.toISOString())
  expect("token" in original).toBe(false)
  expect(f.writes).toEqual(["approval.updateMany", "approval-audit.create"])
  const native = {
    ...input(row),
    clientDecisionId: "server-command",
    expectedPolicyRevision: 4,
  }
  await expect(
    rejectCommerceQuoteVersionInTransaction(f.tx, native),
  ).resolves.toMatchObject({ approvalId: row.id, releaseState: "rejected" })
  expect(f.writes).toHaveLength(2)
  await expect(
    rejectCommerceQuoteVersionInTransaction(f.tx, {
      ...native,
      reason: "Different reason",
    }),
  ).rejects.toThrow("different input")
  expect(row.decidedAt?.toISOString()).toBe(original.decidedAt)
  // GENERAL completed recovery must return the original receipt, not prepare/execute again.
  await expect(
    prepareReviewedQuoteDecisionInTransaction(f.tx, input(row)),
  ).rejects.toThrow()
})

test("changed native release facts after preparation yield refusal, never a completed superseded receipt", async () => {
  const row = decision()
  const f = fixture([row], true)
  const prepared = await prepareReviewedQuoteDecisionInTransaction(
    f.tx,
    input(row),
  )
  f.state.assigned = false
  await expect(prepared.execute("server-command")).rejects.toThrow(
    "must roll back",
  )
  expect(row.status).toBe("SUPERSEDED")
  // This is transaction-local fake state, not proof of a real rollback; root GENERAL must roll it back.
  expect(row.quoteVersion.status).toBe("SUPERSEDED")
  expect(f.writes).toEqual([
    "approval.updateMany",
    "version.updateMany",
    "approval-audit.create",
  ])
})

test("approval review retains current author Terms refusal without any write or provider screening", async () => {
  const row = decision()
  const f = fixture([row])
  f.state.termsAccepted = false
  await expect(
    prepareReviewedQuoteDecisionInTransaction(f.tx, input(row, "approve")),
  ).rejects.toThrow("Terms")
  expect(f.writes).toEqual([])
  expect(
    f.reads.filter((r) => r.table === "legalAcceptance").length,
  ).toBeGreaterThan(0)
  const rejected = await prepareReviewedQuoteDecisionInTransaction(
    f.tx,
    input(row, "reject"),
  )
  expect(rejected.review.decision).toBe("reject")
})

test("original read retains recorded decision time, membership and reason without tokens or current-actor substitution", async () => {
  const row = decision()
  const f = fixture([row], true)
  await rejectCommerceQuoteVersionInTransaction(f.tx, {
    ...input(row),
    expectedPolicyRevision: 4,
    clientDecisionId: "recorded-decision",
  })
  const writes = [...f.writes]
  const original = await getCommerceQuoteApprovalReadOnlyInTransaction(
    f.tx,
    input(row),
  )
  expect(original.decidedAt).toEqual(row.decidedAt)
  expect(original.decidedByMembershipId).toBe(row.decidedByMembershipId)
  expect(original.decidedByMembershipId).not.toBe(
    original.createdByMembershipId,
  )
  expect(original.reason).toBe("Original stated reason")
  expect(original.status).toBe("rejected")
  for (const field of [
    "decisionClientId",
    "decisionPayloadHash",
    "acceptanceTokenDigest",
    "token",
  ])
    expect(original).not.toHaveProperty(field)
  expect(f.writes).toEqual(writes)
})
