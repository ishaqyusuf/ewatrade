import { afterAll, expect, spyOn, test } from "bun:test"
import type { AssistantActionProposal } from "@ewatrade/db/browser"
import { currentEffectiveLegalPublication } from "@ewatrade/utils/legal-approval"
import {
  field,
  matches,
  project,
  reviewedIssueFixture,
  reviewedIssueScope as scope,
} from "../../../../packages/db/src/queries/test-helpers/commerce-quote-reviewed-issue"
import {
  editGeneralQuoteIssueDraftInTransaction,
  generalQuoteIssueDraftPayload,
} from "./general-quote-issue-draft-store"
import { generalQuoteIssueNativeInput } from "./general-quote-issue-intent"
import {
  type QuoteReviewPage,
  assembleGeneralQuoteIssueReview,
  quoteReviewEnvelopeBytes,
} from "./general-quote-issue-review-pages"
import {
  QUOTE_REVIEW_STORE_REQUEST_MAX_BYTES,
  readGeneralQuoteIssueReviewManifestInTransaction,
  readGeneralQuoteIssueReviewPageInTransaction,
} from "./general-quote-issue-review-store"
import { QUOTE_WIRE_MAX_BYTES } from "./general-quote-issue-wire-body"
import { proposalApprovalToken, proposalDigest } from "./proposal-security"

// Actual draft reader/editor, canonical parent/authority/calculator and packet.
// Only two small predicate-aware assistant delegates are added to the existing
// canonical in-memory fixture. No module mocks, DB, transaction or provider run.
function noNetwork(): never {
  throw Error("Review store attempted network")
}
const network = spyOn(globalThis, "fetch").mockImplementation(
  Object.assign(noNetwork, { preconnect: noNetwork }),
)
afterAll(() => network.mockRestore())
const signingKey = "inert-review-store-signing-key-".repeat(3)
const context = { ...scope, conversationId: "general-1" }
const request = {
  conversationId: context.conversationId,
  draftRef: "proposal-1",
  revision: 1,
}
function payload() {
  return {
    action: "commerce_quote_issue",
    intent: {
      source: { kind: "service_request", id: "request-1" },
      operation: { kind: "issue" },
      options: [
        {
          label: "Exact option",
          availabilityOutcome: "unavailable",
          lines: [
            {
              outcome: "unavailable",
              sourceLineId: "line-1",
              customerNote: "Saved explanation",
            },
          ],
        },
      ],
    },
  }
}
type Canonical = ReturnType<typeof reviewedIssueFixture>
async function fixture(configure?: (canonical: Canonical) => unknown) {
  const canonical = reviewedIssueFixture()
  const savedPayload = generalQuoteIssueDraftPayload.parse(
    configure ? configure(canonical) : payload(),
  )
  const idempotencyKey = "operation-1"
  const nativeInput = generalQuoteIssueNativeInput(savedPayload.intent, scope, {
    clientOperationId: idempotencyKey,
  })
  const initialReview = await canonical.review(
    nativeInput,
    currentEffectiveLegalPublication(),
  )
  const conversation = {
    id: context.conversationId,
    tenantId: scope.tenantId,
    storeId: scope.storeId,
    ownerUserId: scope.actorUserId,
    purpose: "GENERAL",
    status: "ACTIVE",
  }
  const row: AssistantActionProposal = {
    id: request.draftRef,
    conversationId: context.conversationId,
    tenantId: scope.tenantId,
    storeId: scope.storeId,
    actorUserId: scope.actorUserId,
    action: savedPayload.action,
    actionVersion: 1,
    payload: savedPayload,
    payloadHash: proposalDigest(savedPayload),
    revision: 1,
    targetRecordId: initialReview.target.id,
    targetRevision: initialReview.target.revision,
    roleSnapshot: initialReview.review.authority.actor.role,
    approvalTokenHash: "",
    expiresAt: new Date(Date.now() + 15 * 60_000),
    idempotencyKey,
    status: "PENDING",
    executedResult: null,
    errorCode: null,
    decidedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  }
  function resign() {
    row.approvalTokenHash = proposalDigest(
      proposalApprovalToken(row, signingKey),
    )
  }
  resign()
  const reads: Array<{ table: string; input: unknown }> = []
  const writes: unknown[] = []
  const control = { allowEdit: false }
  const assistantConversation = {
    findFirst: async (input: unknown) => {
      reads.push({ table: "assistantConversation", input })
      return project(
        matches(conversation, field(input, "where")) ? conversation : null,
        field(input, "select"),
      )
    },
  }
  const assistantActionProposal = {
    findFirst: async (input: unknown) => {
      reads.push({ table: "assistantActionProposal", input })
      return matches({ ...row, conversation }, field(input, "where"))
        ? structuredClone(row)
        : null
    },
    updateMany: async (input: unknown) => {
      if (!control.allowEdit) throw Error("Review reads must never write")
      writes.push(input)
      if (!matches({ ...row, conversation }, field(input, "where")))
        return { count: 0 }
      const data = field(input, "data")
      for (const [key, value] of Object.entries(data ?? {}))
        Reflect.set(row, key, value)
      return { count: 1 }
    },
  }
  const tx = new Proxy(canonical.tx, {
    get(target, key) {
      if (key === "assistantConversation") return assistantConversation
      if (key === "assistantActionProposal") return assistantActionProposal
      return Reflect.get(target, key)
    },
  })
  async function manifest(
    raw: unknown = request,
    serverScope = scope,
    key = signingKey,
  ): Promise<
    Awaited<ReturnType<typeof readGeneralQuoteIssueReviewManifestInTransaction>>
  > {
    return Reflect.apply(
      readGeneralQuoteIssueReviewManifestInTransaction,
      undefined,
      [tx, serverScope, raw, key],
    )
  }
  async function page(
    raw: unknown,
    serverScope = scope,
    key = signingKey,
  ): Promise<
    Awaited<ReturnType<typeof readGeneralQuoteIssueReviewPageInTransaction>>
  > {
    return Reflect.apply(
      readGeneralQuoteIssueReviewPageInTransaction,
      undefined,
      [tx, serverScope, raw, key],
    )
  }
  async function edit(
    raw: unknown,
  ): Promise<
    Awaited<ReturnType<typeof editGeneralQuoteIssueDraftInTransaction>>
  > {
    control.allowEdit = true
    try {
      return await Reflect.apply(
        editGeneralQuoteIssueDraftInTransaction,
        undefined,
        [tx, { ...context, request: raw }, signingKey],
      )
    } finally {
      control.allowEdit = false
    }
  }
  return {
    canonical,
    row,
    conversation,
    reads,
    writes,
    manifest,
    page,
    edit,
    resign,
    initialReview,
  }
}

test("actual saved draft reads yield only compact manifest or one exact page with server binding", async () => {
  const f = await fixture()
  const manifest = await f.manifest()
  if (manifest.kind !== "quote_review_manifest")
    throw Error("Expected manifest")
  expect(manifest.binding).toEqual({
    ...scope,
    conversationId: context.conversationId,
    proposalId: f.row.id,
    proposalRevision: f.row.revision,
    payloadHash: f.row.payloadHash,
  })
  expect(manifest.target).toEqual(f.initialReview.target)
  expect(Object.keys(manifest).sort()).toEqual([
    "binding",
    "contentHash",
    "counts",
    "documentBytes",
    "format",
    "kind",
    "packetId",
    "pages",
    "projection",
    "summary",
    "target",
  ])
  const descriptor = manifest.pages[0]
  if (!descriptor) throw Error("Expected page descriptor")
  const page = await f.page({
    ...request,
    packetId: manifest.packetId,
    pageId: descriptor.pageId,
  })
  if (page.kind !== "quote_review_page") throw Error("Expected exact page")
  expect(page.pageId).toBe(descriptor.pageId)
  expect(assembleGeneralQuoteIssueReview(manifest, [page]).kind).toBe(
    "complete",
  )
  expect(JSON.stringify(manifest)).not.toMatch(
    /PRIVATE_PHONE|PRIVATE_EMAIL|approvalToken|nativeInput|"payload"|"review"/,
  )
  expect(JSON.stringify(page)).not.toMatch(
    /approvalTokenHash|acceptanceToken|screeningProof/,
  )
  expect(quoteReviewEnvelopeBytes(manifest)).toBeLessThan(QUOTE_WIRE_MAX_BYTES)
  expect(quoteReviewEnvelopeBytes(page)).toBeLessThan(QUOTE_WIRE_MAX_BYTES)
  expect(
    f.reads.filter((read) => read.table === "assistantConversation"),
  ).toHaveLength(2)
  expect(
    f.reads.filter((read) => read.table === "assistantActionProposal"),
  ).toHaveLength(2)
  expect(f.writes).toEqual([])
  expect(f.canonical.writes).toEqual([])
  expect(f.canonical.denied).toEqual([])
})

test("complete20by100 saved draft over4.5MiB is freshly read on every page and assembles exactly", async () => {
  const note = `${"\u0001".repeat(450)}漢😀\"\\`
  const f = await fixture((canonical) => {
    const line = canonical.state.lines[0]
    if (!line) throw Error("Expected original")
    canonical.state.lines = Array.from({ length: 100 }, (_, index) => ({
      ...line,
      id: `line-${index}`,
    }))
    canonical.state.links = Array.from({ length: 100 }, (_, index) => ({
      conversationId: `chat-${index}`,
    }))
    return {
      ...payload(),
      intent: {
        ...payload().intent,
        options: Array.from({ length: 20 }, (_, index) => ({
          label: `Choice😀${index}`,
          availabilityOutcome: "unavailable",
          lines: canonical.state.lines.map((source) => ({
            outcome: "unavailable",
            sourceLineId: source.id,
            customerNote: note,
          })),
        })),
      },
    }
  })
  const manifest = await f.manifest()
  if (manifest.kind !== "quote_review_manifest")
    throw Error("Expected complete manifest")
  expect(manifest.documentBytes).toBeGreaterThan(4.5 * 1024 * 1024)
  expect(manifest.counts).toMatchObject({
    sourceLines: 100,
    options: 20,
    optionLines: Array(20).fill(100),
    linkedConversations: 100,
  })
  const pages: QuoteReviewPage[] = []
  for (const descriptor of manifest.pages) {
    const page = await f.page({
      ...request,
      packetId: manifest.packetId,
      pageId: descriptor.pageId,
    })
    if (page.kind !== "quote_review_page")
      throw Error("Expected every current page")
    expect(quoteReviewEnvelopeBytes(page)).toBeLessThan(QUOTE_WIRE_MAX_BYTES)
    pages.push(page)
  }
  const complete = assembleGeneralQuoteIssueReview(manifest, pages)
  if (complete.kind !== "complete")
    throw Error("Expected complete semantic review")
  expect(complete.document.review.options).toHaveLength(20)
  expect(complete.document.review.source.lines).toHaveLength(100)
  expect(complete.document.review.effects.linkedConversations).toHaveLength(100)
  for (const option of complete.document.review.options)
    for (const line of option.lines) expect(line.customerNote).toBe(note)
  const parentReads = f.canonical.reads.filter(
    (read) =>
      read.table === "serviceRequest" &&
      field(field(read.input, "select"), "lines") !== undefined,
  )
  expect(parentReads.length).toBe(manifest.pages.length + 2) // seed + manifest + every page
  expect(f.writes).toEqual([])
  expect(f.canonical.writes).toEqual([])
  expect(f.canonical.denied).toEqual([])
}, 60_000)

test("actual edit rotates stored revision, payload and target; old revision and packet cannot read", async () => {
  const f = await fixture()
  const before = await f.manifest()
  if (before.kind !== "quote_review_manifest")
    throw Error("Expected original manifest")
  const first = before.pages[0]
  if (!first) throw Error("Expected first page")
  const edited = await f.edit({
    draftRef: request.draftRef,
    expectedRevision: 1,
    edit: {
      kind: "set_option",
      index: 0,
      option: {
        label: "Changed choice",
        availabilityOutcome: "unavailable",
        lines: [
          {
            outcome: "unavailable",
            sourceLineId: "line-1",
            customerNote: "New exact explanation",
          },
        ],
      },
    },
  })
  expect(edited.revision).toBe(2)
  expect(await f.manifest()).toEqual({
    kind: "unavailable",
    reason: "stale_review",
  })
  const oldPage = {
    ...request,
    packetId: before.packetId,
    pageId: first.pageId,
  }
  expect(await f.page(oldPage)).toEqual({
    kind: "unavailable",
    reason: "stale_review",
  })
  expect(await f.page({ ...oldPage, revision: 2 })).toEqual({
    kind: "unavailable",
    reason: "stale_review",
  })
  const current = await f.manifest({ ...request, revision: 2 })
  if (current.kind !== "quote_review_manifest")
    throw Error("Expected refreshed manifest")
  expect(current.binding.proposalRevision).toBe(2)
  expect(current.binding.payloadHash).not.toBe(before.binding.payloadHash)
  expect(current.target.revision).not.toBe(before.target.revision)
  expect(current.packetId).not.toBe(before.packetId)
  expect(f.writes).toHaveLength(1) // explicit inert edit only, zero review writes
  expect(f.canonical.writes).toEqual([])
})

test("current source, access, role and policy drift makes previous stored review unavailable", async () => {
  for (const drift of [
    "source",
    "access",
    "role",
    "denied-role",
    "inactive",
    "terms",
    "policy",
  ]) {
    const f = await fixture()
    const manifest = await f.manifest()
    if (manifest.kind !== "quote_review_manifest")
      throw Error("Expected initial manifest")
    const descriptor = manifest.pages[0]
    if (!descriptor) throw Error("Expected descriptor")
    if (drift === "source") f.canonical.state.sourceRow.revision++
    if (drift === "access") f.canonical.state.member.staffAccessRevision++
    if (drift === "role") f.canonical.state.member.role = "ADMIN"
    if (drift === "denied-role") f.canonical.state.member.role = "OPERATOR"
    if (drift === "inactive") f.canonical.state.member.status = "SUSPENDED"
    if (drift === "terms") f.canonical.state.terms = false
    if (drift === "policy") f.canonical.state.policyAllowed = false
    expect(await f.manifest()).toEqual({
      kind: "unavailable",
      reason: "unavailable",
    })
    expect(
      await f.page({
        ...request,
        packetId: manifest.packetId,
        pageId: descriptor.pageId,
      }),
    ).toEqual({ kind: "unavailable", reason: "unavailable" })
    expect(f.writes).toEqual([])
    expect(f.canonical.denied).toEqual([])
  }
})

test("foreign conversation, proposal, server scope and packet/page identities refuse", async () => {
  const f = await fixture()
  const manifest = await f.manifest()
  if (manifest.kind !== "quote_review_manifest")
    throw Error("Expected manifest")
  const descriptor = manifest.pages[0]
  if (!descriptor) throw Error("Expected descriptor")
  for (const changed of [
    { conversationId: "foreign" },
    { draftRef: "foreign" },
  ])
    expect((await f.manifest({ ...request, ...changed })).kind).toBe(
      "unavailable",
    )
  for (const changed of [
    { actorUserId: "foreign" },
    { tenantId: "foreign" },
    { storeId: "foreign" },
  ])
    expect((await f.manifest(request, { ...scope, ...changed })).kind).toBe(
      "unavailable",
    )
  expect(
    await f.page({
      ...request,
      packetId: "0".repeat(64),
      pageId: descriptor.pageId,
    }),
  ).toEqual({ kind: "unavailable", reason: "stale_review" })
  expect(
    await f.page({
      ...request,
      packetId: manifest.packetId,
      pageId: "0".repeat(64),
    }),
  ).toEqual({ kind: "unavailable", reason: "unavailable" })
  f.conversation.status = "CLOSED"
  expect((await f.manifest()).kind).toBe("unavailable")
  expect(f.writes).toEqual([])
})

test("expired, corrupted, terminal and wrong-signing-key stored rows expose no review", async () => {
  for (const corruption of [
    "expiry",
    "payload",
    "hash",
    "approval",
    "target",
    "terminal",
    "role",
    "version",
    "result",
    "error",
    "decision",
  ]) {
    const f = await fixture()
    if (corruption === "expiry") {
      f.row.expiresAt = new Date(Date.now() - 1)
      f.resign()
    }
    if (corruption === "payload") {
      if (typeof f.row.payload !== "object" || f.row.payload === null)
        throw Error("Expected saved object")
      Reflect.set(f.row.payload, "extra", "secret")
    }
    if (corruption === "hash") f.row.payloadHash = "b".repeat(64)
    if (corruption === "approval") f.row.approvalTokenHash = "b".repeat(64)
    if (corruption === "target") f.row.targetRevision = "b".repeat(64)
    if (corruption === "terminal") f.row.status = "CANCELLED"
    if (corruption === "role") f.row.roleSnapshot = "ADMIN"
    if (corruption === "version") f.row.actionVersion = 2
    if (corruption === "result") f.row.executedResult = { saved: true }
    if (corruption === "error") f.row.errorCode = "PRIVATE_ERROR"
    if (corruption === "decision") f.row.decidedAt = new Date()
    expect(await f.manifest()).toEqual({
      kind: "unavailable",
      reason: "unavailable",
    })
    expect(f.writes).toEqual([])
  }
  const f = await fixture()
  expect(await f.manifest(request, scope, "wrong".repeat(12))).toEqual({
    kind: "unavailable",
    reason: "unavailable",
  })
})

test("small unknown requests are budgeted and descriptor-checked before any schema/DB callbacks", async () => {
  const f = await fixture()
  let callbacks = 0
  const hidden = { ...request }
  Object.defineProperty(hidden, "revision", {
    enumerable: false,
    get() {
      callbacks++
      throw Error("DO_NOT_EXECUTE")
    },
  })
  const proxy = new Proxy(request, {
    get() {
      callbacks++
      throw Error("DO_NOT_EXECUTE")
    },
  })
  const cyclic: Record<string, unknown> = { ...request }
  cyclic.cycle = cyclic
  const invalid: unknown[] = [
    null,
    [],
    {},
    hidden,
    proxy,
    cyclic,
    { ...request, actorUserId: scope.actorUserId },
    { ...request, tenantId: scope.tenantId },
    { ...request, manifest: {} },
    { ...request, approvalToken: "never-authorize" },
    { ...request, revision: 0 },
    { ...request, revision: 2_147_483_648 },
    { ...request, revision: 1.5 },
    { ...request, draftRef: " proposal-1" },
    {
      ...request,
      conversationId: "a".repeat(QUOTE_REVIEW_STORE_REQUEST_MAX_BYTES),
    },
    {
      ...request,
      toJSON() {
        callbacks++
        return request
      },
    },
  ]
  const before = f.reads.length
  for (const raw of invalid)
    expect(await f.manifest(raw)).toEqual({
      kind: "unavailable",
      reason: "invalid_request",
    })
  expect(
    await f.page({ ...request, packetId: "not-hash", pageId: "b".repeat(64) }),
  ).toEqual({ kind: "unavailable", reason: "invalid_request" })
  expect(f.reads).toHaveLength(before)
  expect(callbacks).toBe(0)
  expect(network).not.toHaveBeenCalled()
})

test("server scope and small request scalars are captured before the first await", async () => {
  const f = await fixture()
  const raw = { ...request }
  const serverScope = { ...scope }
  const pending = f.manifest(raw, serverScope)
  raw.conversationId = "other-conversation"
  raw.draftRef = "other-proposal"
  raw.revision = 2
  serverScope.actorUserId = "other-actor"
  serverScope.tenantId = "other-tenant"
  serverScope.storeId = "other-store"
  const manifest = await pending
  if (manifest.kind !== "quote_review_manifest")
    throw Error("Expected original captured read")
  expect(manifest.binding).toMatchObject({
    ...scope,
    conversationId: request.conversationId,
    proposalId: request.draftRef,
    proposalRevision: 1,
  })
  expect(f.writes).toEqual([])
})

test("complete review resource refusal returns only typed unavailable and no partial manifest", async () => {
  const controlText = "\u0001".repeat(500)
  const f = await fixture((canonical) => {
    const first = canonical.state.lines[0]
    if (!first) throw Error("Expected original source")
    canonical.state.lines = Array.from({ length: 100 }, (_, index) => ({
      ...first,
      id: `line-${index}`,
    }))
    return {
      ...payload(),
      intent: {
        ...payload().intent,
        options: Array.from({ length: 20 }, (_, index) => ({
          label: `Choice${index}`,
          availabilityOutcome: "unavailable",
          lines: canonical.state.lines.map((source) => ({
            outcome: "unavailable",
            sourceLineId: source.id,
            customerNote: controlText,
          })),
        })),
      },
    }
  })
  const selections = Array.from({ length: 100 }, () => ({
    group: controlText,
    value: controlText,
  }))
  f.canonical.state.lines = f.canonical.state.lines.map((line) => ({
    ...line,
    optionSelections: selections,
  }))
  // Logical escaped source60MB + intent/review12MB crosses64MiB. Reuse strings
  // and references; do not allocate JSON.stringify of the oversized document.
  expect(await f.manifest()).toEqual({
    kind: "unavailable",
    reason: "review_too_large",
  })
  expect(f.writes).toEqual([])
  expect(f.canonical.writes).toEqual([])
  expect(f.canonical.denied).toEqual([])
})

test("manifest and page refuse expiry after both actual store checks and complete packet construction", async () => {
  for (const operation of ["manifest", "page"]) {
    const f = await fixture()
    const manifest = await f.manifest()
    if (manifest.kind !== "quote_review_manifest")
      throw Error("Expected initial manifest")
    const first = manifest.pages[0]
    if (!first) throw Error("Expected exact page descriptor")
    const expires = f.row.expiresAt.getTime()
    let clockReads = 0
    // Actual draft-store.read performs two Date.now expiry checks, surrounding
    // its real canonical read. Time reaches expiry only AFTER they both pass:
    // the composition's post-serialization check must refuse the whole result.
    const clock = spyOn(Date, "now").mockImplementation(() => {
      clockReads++
      return clockReads <= 2 ? expires - 1 : expires
    })
    try {
      const result =
        operation === "manifest"
          ? await f.manifest()
          : await f.page({
              ...request,
              packetId: manifest.packetId,
              pageId: first.pageId,
            })
      expect(result).toEqual({ kind: "unavailable", reason: "unavailable" })
      expect(clockReads).toBe(3)
    } finally {
      clock.mockRestore()
    }
    expect(f.writes).toEqual([])
    expect(f.canonical.writes).toEqual([])
    expect(f.canonical.denied).toEqual([])
  }
})
