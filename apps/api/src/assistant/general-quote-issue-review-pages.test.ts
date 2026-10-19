import { afterAll, expect, setSystemTime, spyOn, test } from "bun:test"
import superjson from "superjson"
import {
  reviewedIssueFixture,
  reviewedIssueIntent,
} from "../../../../packages/db/src/queries/test-helpers/commerce-quote-reviewed-issue"
import {
  QUOTE_REVIEW_ENVELOPE_RESERVE_BYTES,
  type QuoteReviewBinding,
  assembleGeneralQuoteIssueReview,
  createGeneralQuoteIssueReviewPacket,
  quoteReviewEnvelopeBytes,
  readGeneralQuoteIssueReviewPage,
} from "./general-quote-issue-review-pages"
import { QUOTE_WIRE_MAX_BYTES } from "./general-quote-issue-wire-body"

// Actual canonical parent, authority, options calculator and protocol. In-memory
// predicate-aware persistence delegates only; no module mocks or real SQL. This
// does not prove authenticated route integration, transport deployment or UI.
function noNetwork(): never {
  throw Error("Review paging attempted network")
}
const network = spyOn(globalThis, "fetch").mockImplementation(
  Object.assign(noNetwork, { preconnect: noNetwork }),
)
afterAll(() => {
  network.mockRestore()
  setSystemTime()
})
const binding: QuoteReviewBinding = {
  actorUserId: "actor-1",
  tenantId: "tenant-1",
  storeId: "store-1",
  conversationId: "conversation-1",
  proposalId: "proposal-1",
  proposalRevision: 3,
  payloadHash: "a".repeat(64),
}
async function small() {
  const fixture = reviewedIssueFixture()
  const parent = await fixture.review()
  const packet = createGeneralQuoteIssueReviewPacket(parent, binding)
  if (packet.kind !== "available")
    throw Error(`Expected complete packet: ${packet.reason}`)
  return { fixture, parent, packet }
}

test("actual parent exact scope, complete metadata and every semantic fact round trip with ISO dates", async () => {
  const { fixture, parent, packet } = await small()
  expect(packet.manifest.binding).toEqual(binding)
  expect(packet.manifest.target).toEqual(parent.target)
  expect(packet.manifest.summary).toEqual({
    source: { kind: "service_request", id: "request-1", revision: 3 },
    operation: "issue",
    currentQuote: null,
    newVersionSequence: 1,
  })
  expect(packet.manifest.counts).toEqual({
    sourceLines: 1,
    options: 1,
    optionLines: [1],
    linkedConversations: 0,
    offerings: 0,
    priceSuggestions: 0,
    sourcePreparations: 0,
  })
  const complete = assembleGeneralQuoteIssueReview(
    packet.manifest,
    packet.pages,
  )
  expect(complete.kind).toBe("complete")
  if (complete.kind !== "complete") throw Error("Expected complete review")
  const expected: unknown = JSON.parse(
    JSON.stringify({
      format: packet.manifest.format,
      projection: packet.manifest.projection,
      target: parent.target,
      review: {
        ...parent.review,
        options: parent.review.options.map((option) => ({
          ...option,
          lines: option.lines.map(
            ({ catalogPriceEvaluationAt: _clock, ...line }) => line,
          ),
        })),
      },
    }),
  )
  expect<unknown>(complete.document).toEqual(expected)
  expect(complete.document.review.source.createdAt).toBe(
    "2026-10-01T00:00:00.000Z",
  )
  expect(complete.document.review.source.customerPhone).toBe("PRIVATE_PHONE")
  // Saved private business facts are for the exact protected reviewer. No bearer
  // capability, screening proof or approval token is emitted in this protocol.
  expect(JSON.stringify(packet)).not.toMatch(
    /token|password|credential|authorization/i,
  )
  expect(fixture.writes).toEqual([])
  expect(fixture.denied).toEqual([])
})

test("complete actual20by100 review over4.5MiB retains escaped/multibyte facts and every source/link", async () => {
  const fixture = reviewedIssueFixture()
  const sourceLine = fixture.state.lines[0]
  if (!sourceLine) throw Error("Expected exact source line")
  const note = `${"\u0001".repeat(450)}漢😀\"\\\n`
  fixture.state.lines = Array.from({ length: 100 }, (_, index) => ({
    ...sourceLine,
    id: `line-${index}`,
  }))
  fixture.state.links = Array.from({ length: 100 }, (_, index) => ({
    conversationId: `chat-${index}`,
  }))
  const {
    lines: _lines,
    availabilityOutcome: _availability,
    ...base
  } = reviewedIssueIntent()
  const parent = await fixture.review({
    ...base,
    options: Array.from({ length: 20 }, (_, index) => ({
      clientOptionId: `option-${index}`,
      label: `選択😀 ${index}`,
      availabilityOutcome: "unavailable",
      lines: fixture.state.lines.map((line) => ({
        outcome: "unavailable",
        sourceLineId: line.id,
        customerNote: note,
      })),
    })),
  })
  const packet = createGeneralQuoteIssueReviewPacket(parent, binding)
  if (packet.kind !== "available")
    throw Error(`Expected max shape: ${packet.reason}`)
  expect(packet.manifest.documentBytes).toBeGreaterThan(4.5 * 1024 * 1024)
  expect(packet.pages.length).toBeGreaterThan(20)
  expect(packet.manifest.counts.optionLines).toEqual(Array(20).fill(100))
  expect(packet.manifest.counts.sourceLines).toBe(100)
  expect(packet.manifest.counts.linkedConversations).toBe(100)
  for (const value of [packet.manifest, ...packet.pages]) {
    const envelope = JSON.stringify([
      { result: { data: superjson.serialize(value) } },
    ])
    expect(quoteReviewEnvelopeBytes(value)).toBe(
      Buffer.byteLength(envelope, "utf8"),
    )
    expect(
      Buffer.byteLength(envelope, "utf8") + QUOTE_REVIEW_ENVELOPE_RESERVE_BYTES,
    ).toBeLessThanOrEqual(QUOTE_WIRE_MAX_BYTES)
  }
  for (const page of packet.pages) {
    expect(Buffer.from(page.fragment, "utf8").toString("utf8")).toBe(
      page.fragment,
    )
    const last = page.fragment.charCodeAt(page.fragment.length - 1)
    expect(last >= 0xd800 && last <= 0xdbff).toBe(false)
  }
  const complete = assembleGeneralQuoteIssueReview(
    packet.manifest,
    packet.pages,
  )
  if (complete.kind !== "complete")
    throw Error("Expected full assembled review")
  for (const broken of [
    [...packet.pages].reverse(),
    packet.pages.filter((_, index) => index !== 3),
    packet.pages.map((page, index) => (index === 3 ? packet.pages[2] : page)),
  ])
    expect(assembleGeneralQuoteIssueReview(packet.manifest, broken).kind).toBe(
      "unavailable",
    )
  expect(complete.document.review.options).toHaveLength(20)
  expect(complete.document.review.source.lines).toHaveLength(100)
  expect(complete.document.review.effects.linkedConversations).toHaveLength(100)
  for (const option of complete.document.review.options) {
    expect(option.lines).toHaveLength(100)
    for (const line of option.lines) expect(line.customerNote).toBe(note.trim())
  }
  expect(fixture.writes).toEqual([])
  expect(fixture.denied).toEqual([])
})

test("deterministic recomputation and sole clock omission preserve expiry/effective/source dates", async () => {
  const fixture = reviewedIssueFixture()
  const input = {
    ...reviewedIssueIntent(),
    availabilityOutcome: "full" as const,
    lines: [
      {
        outcome: "included" as const,
        offeringId: "offering-1",
        sourceLineId: "line-1",
        quantity: "1.25",
        unitPriceMinor: 100,
      },
    ],
    expiresAt: new Date("2027-01-02T03:04:05.123Z"),
  }
  setSystemTime(new Date("2026-10-16T12:00:00Z"))
  const first = await fixture.review(input)
  expect(
    first.review.options[0]?.lines[0]?.catalogPriceEvaluationAt,
  ).toBeInstanceOf(Date)
  const packet = createGeneralQuoteIssueReviewPacket(first, binding)
  if (packet.kind !== "available") throw Error("Expected complete packet")
  setSystemTime(new Date("2026-10-16T12:01:00Z"))
  const second = await fixture.review(input)
  const current = createGeneralQuoteIssueReviewPacket(
    second,
    binding,
    packet.manifest,
  )
  expect(current).toEqual(packet)
  const page = packet.pages[0]
  if (!page) throw Error("Expected first page")
  expect(
    readGeneralQuoteIssueReviewPage(
      second,
      binding,
      packet.manifest,
      page.pageId,
    ),
  ).toEqual(page)
  const assembled = assembleGeneralQuoteIssueReview(
    packet.manifest,
    packet.pages,
  )
  if (assembled.kind !== "complete") throw Error("Expected complete review")
  expect(assembled.document.review.command.expiresAt).toBe(
    "2027-01-02T03:04:05.123Z",
  )
  expect(
    assembled.document.review.authority.legal.publication?.effectiveDate,
  ).toBe("2026-01-01")
  expect(JSON.stringify(assembled.document.review.options)).not.toContain(
    "catalogPriceEvaluationAt",
  )
  setSystemTime()
})

test("exact current Quote/version and pending approval deferred effects retain their complete facts", async () => {
  const fixture = reviewedIssueFixture()
  fixture.state.maxVersion = 4
  fixture.state.version = {
    id: "version-1",
    quoteId: "quote-1",
    version: 2,
    status: "ISSUED",
    clientVersionId: "previous-version-command",
    payloadHash: "prior-input",
    createdAt: new Date("2026-10-01T00:00:00Z"),
    expiresAt: new Date("2027-01-01T00:00:00Z"),
    currencyCode: "NGN",
    createdByUserId: "original-actor",
    issuedAt: new Date("2026-10-02T00:00:00Z"),
    acceptedAt: null,
    declinedAt: null,
    supersededAt: null,
    revokedAt: null,
    acceptedOrderId: null,
    optionSelection: null,
    quoteApproval: null,
  }
  fixture.state.quote = {
    id: "quote-1",
    tenantId: binding.tenantId,
    storeId: binding.storeId,
    sourceId: "request-1",
    sourceType: "SERVICE_REQUEST",
    clientQuoteId: "quote-command-1",
    currentVersionId: "version-1",
    currentVersion: fixture.state.version,
  }
  const parent = await fixture.review({
    ...reviewedIssueIntent(),
    operation: {
      kind: "revise",
      quoteId: "quote-1",
      quoteVersionId: "version-1",
    },
  })
  const packet = createGeneralQuoteIssueReviewPacket(parent, binding)
  if (packet.kind !== "available") throw Error("Expected exact revision packet")
  expect(packet.manifest.summary).toEqual({
    source: { kind: "service_request", id: "request-1", revision: 3 },
    operation: "revise",
    currentQuote: {
      id: "quote-1",
      currentVersionId: "version-1",
      version: 2,
      status: "ISSUED",
    },
    newVersionSequence: 5,
  })
  const assembled = assembleGeneralQuoteIssueReview(
    packet.manifest,
    packet.pages,
  )
  if (assembled.kind !== "complete") throw Error("Expected exact revision")
  expect(assembled.document.review.currentQuote?.currentVersion?.issuedAt).toBe(
    "2026-10-02T00:00:00.000Z",
  )
  expect(
    assembled.document.review.currentQuote?.currentVersion?.expiresAt,
  ).toBe("2027-01-01T00:00:00.000Z")
  const pending = reviewedIssueFixture()
  pending.state.releasePolicy = {
    mode: "APPROVAL_REQUIRED",
    revision: 3,
    selectedApproverMembershipIds: ["checker-1"],
  }
  pending.state.team = [
    { capability: "ATTENDANT", membershipId: "member-1" },
    { capability: "QUOTE_APPROVER", membershipId: "checker-1" },
  ]
  const deferred = await pending.review()
  const deferredPacket = createGeneralQuoteIssueReviewPacket(deferred, binding)
  if (deferredPacket.kind !== "available")
    throw Error("Expected deferred review")
  expect(deferredPacket.manifest.counts.linkedConversations).toBeNull()
  const deferredComplete = assembleGeneralQuoteIssueReview(
    deferredPacket.manifest,
    deferredPacket.pages,
  )
  if (deferredComplete.kind !== "complete")
    throw Error("Expected complete deferred review")
  expect(
    deferredComplete.document.review.effects.linkedConversations,
  ).toBeNull()
  expect(deferredComplete.document.review.effects.linkedCoverage).toBe(
    "not_read_no_effects_until_approval",
  )
  expect(
    deferredComplete.document.review.effects.createsPublicAcceptanceCapability,
  ).toBe(false)
  expect(fixture.denied).toEqual([])
  expect(pending.denied).toEqual([])
})

test("fresh scope/proposal/payload/target/business drift refuses old manifest without partial output", async () => {
  const { fixture, parent, packet } = await small()
  const page = packet.pages[0]
  if (!page) throw Error("Expected first page")
  for (const changed of [
    { conversationId: "conversation-2" },
    { proposalId: "proposal-2" },
    { proposalRevision: 4 },
    { payloadHash: "b".repeat(64) },
  ])
    expect(
      createGeneralQuoteIssueReviewPacket(
        parent,
        { ...binding, ...changed },
        packet.manifest,
      ),
    ).toEqual({ kind: "unavailable", reason: "stale_review" })
  for (const changed of [
    { actorUserId: "other" },
    { tenantId: "other" },
    { storeId: "other" },
  ])
    expect(
      createGeneralQuoteIssueReviewPacket(parent, { ...binding, ...changed }),
    ).toEqual({ kind: "unavailable", reason: "unsupported_review" })
  fixture.state.sourceRow.updatedAt = new Date("2026-10-10T00:00:00Z")
  const drift = await fixture.review()
  expect(
    readGeneralQuoteIssueReviewPage(
      drift,
      binding,
      packet.manifest,
      page.pageId,
    ),
  ).toEqual({ kind: "unavailable", reason: "stale_review" })
  expect(
    readGeneralQuoteIssueReviewPage(
      parent,
      binding,
      packet.manifest,
      "0".repeat(64),
    ),
  ).toEqual({ kind: "unavailable", reason: "incomplete_or_invalid_pages" })
})

test("missing, extra, duplicated, mixed, reordered, refused and tampered page sets never assemble", async () => {
  const { parent, packet } = await small()
  const first = packet.pages[0]
  if (!first) throw Error("Expected first page")
  const other = createGeneralQuoteIssueReviewPacket(parent, {
    ...binding,
    proposalRevision: 4,
  })
  if (other.kind !== "available") throw Error("Expected another packet")
  const broken: unknown[] = [
    [],
    [...packet.pages, first],
    [first, first],
    other.pages,
    [{ kind: "unavailable", reason: "stale_review" }],
    [{ ...first, fragment: `${first.fragment} ` }],
    [{ ...first, hash: "0".repeat(64) }],
    [{ ...first, pageId: "0".repeat(64) }],
    [{ ...first, index: 1 }],
    [{ ...first, binding: { ...first.binding, actorUserId: "other" } }],
    [{ ...first, target: { ...first.target, revision: "0".repeat(64) } }],
    [{ ...first, approvalToken: "must-never-escape" }],
    null,
  ]
  for (const pages of broken)
    expect(assembleGeneralQuoteIssueReview(packet.manifest, pages)).toEqual({
      kind: "unavailable",
      reason: "incomplete_or_invalid_pages",
    })
  const changedCount = {
    ...packet.manifest,
    counts: { ...packet.manifest.counts, sourceLines: 0 },
  }
  expect(assembleGeneralQuoteIssueReview(changedCount, packet.pages).kind).toBe(
    "unavailable",
  )
})

test("untrusted widened DTO/accessors/cycles/oversize fail closed before serialization, without secrets", async () => {
  const { parent } = await small()
  const credential = structuredClone(parent)
  Reflect.set(credential.review, "approvalToken", "DO_NOT_RETURN")
  expect(createGeneralQuoteIssueReviewPacket(credential, binding)).toEqual({
    kind: "unavailable",
    reason: "unsupported_review",
  })
  const cyclic = structuredClone(parent)
  Reflect.set(cyclic.review, "cycle", cyclic)
  expect(createGeneralQuoteIssueReviewPacket(cyclic, binding).kind).toBe(
    "unavailable",
  )
  let getterCalls = 0
  const accessor = structuredClone(parent)
  Object.defineProperty(accessor.review, "details", {
    enumerable: true,
    get() {
      getterCalls++
      throw Error("DO_NOT_RETURN")
    },
  })
  expect(createGeneralQuoteIssueReviewPacket(accessor, binding).kind).toBe(
    "unavailable",
  )
  expect(getterCalls).toBe(0)
  const huge = structuredClone(parent)
  Reflect.set(huge.review.source, "details", "\u0001".repeat(12 * 1024 * 1024))
  expect(createGeneralQuoteIssueReviewPacket(huge, binding)).toEqual({
    kind: "unavailable",
    reason: "review_too_large",
  })
  expect(network).not.toHaveBeenCalled()
})

test("untrusted outer page array proxies and index getters never execute", async () => {
  const { packet } = await small()
  let calls = 0
  const proxy = new Proxy(packet.pages, {
    get() {
      calls++
      throw Error("DO_NOT_EXECUTE")
    },
  })
  expect(assembleGeneralQuoteIssueReview(packet.manifest, proxy).kind).toBe(
    "unavailable",
  )
  const accessor: unknown[] = []
  Object.defineProperty(accessor, "0", {
    get() {
      calls++
      throw Error("DO_NOT_EXECUTE")
    },
  })
  expect(assembleGeneralQuoteIssueReview(packet.manifest, accessor).kind).toBe(
    "unavailable",
  )
  expect(calls).toBe(0)
})

test("known hidden getters cannot execute through strict Zod or typed parent reads", async () => {
  const { parent, packet } = await small()
  let calls = 0
  const hidden = () => {
    calls++
    throw Error("DO_NOT_EXECUTE")
  }
  const manifest = structuredClone(packet.manifest)
  Object.defineProperty(manifest, "binding", { enumerable: false, get: hidden })
  expect(assembleGeneralQuoteIssueReview(manifest, packet.pages).kind).toBe(
    "unavailable",
  )
  expect(
    createGeneralQuoteIssueReviewPacket(parent, binding, manifest).kind,
  ).toBe("unavailable")
  const page = structuredClone(packet.pages[0])
  if (!page) throw Error("Expected page")
  Object.defineProperty(page, "fragment", { enumerable: false, get: hidden })
  expect(assembleGeneralQuoteIssueReview(packet.manifest, [page]).kind).toBe(
    "unavailable",
  )
  const scope = structuredClone(binding)
  Object.defineProperty(scope, "actorUserId", {
    enumerable: false,
    get: hidden,
  })
  expect(createGeneralQuoteIssueReviewPacket(parent, scope).kind).toBe(
    "unavailable",
  )
  const unknownParent = structuredClone(parent)
  Object.defineProperty(unknownParent, "review", {
    enumerable: false,
    get: hidden,
  })
  expect(createGeneralQuoteIssueReviewPacket(unknownParent, binding).kind).toBe(
    "unavailable",
  )
  expect(calls).toBe(0)
})
