import { afterAll, expect, setSystemTime, spyOn, test } from "bun:test"
import type { AssistantActionProposal } from "@ewatrade/db/browser"
import {
  field,
  matches,
  project,
  reviewedIssueFixture,
  reviewedIssueScope as scope,
} from "../../../../packages/db/src/queries/test-helpers/commerce-quote-reviewed-issue"
import {
  createGeneralQuoteIssueDraftInTransaction,
  editGeneralQuoteIssueDraftInTransaction,
  generalQuoteIssueDraftPayload,
  readGeneralQuoteIssueDraftInTransaction,
} from "./general-quote-issue-draft-store"
import {
  isProposalApprovalValid,
  proposalApprovalToken,
  proposalDigest,
} from "./proposal-security"

const secret = "source-only-signing-key-".repeat(3)
const ids = {
  proposalId: "server-proposal-1",
  idempotencyKey: "server-operation-1",
}
const inputScope = { ...scope, conversationId: "general-1" }
function denyNetwork(): never {
  throw Error("Draft store must not call a provider")
}
const network = spyOn(globalThis, "fetch").mockImplementation(
  Object.assign(denyNetwork, { preconnect: denyNetwork }),
)
afterAll(() => network.mockRestore())

function payload() {
  return generalQuoteIssueDraftPayload.parse({
    action: "commerce_quote_issue",
    intent: {
      source: { kind: "service_request", id: "request-1" },
      operation: { kind: "issue" },
      options: [
        {
          label: "Saved choice",
          availabilityOutcome: "unavailable",
          customerNote: "No availability yet",
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
  })
}
function string(value: unknown, key: string) {
  const item = field(value, key)
  if (typeof item !== "string") throw Error(`Expected string ${key}`)
  return item
}
function number(value: unknown, key: string) {
  const item = field(value, key)
  if (typeof item !== "number") throw Error(`Expected number ${key}`)
  return item
}
function date(value: unknown, key: string) {
  const item = field(value, key)
  if (!(item instanceof Date)) throw Error(`Expected date ${key}`)
  return new Date(item)
}
function fixture() {
  // Actual shared canonical review/authority/options/pricing delegates, with all
  // domain writes disabled. Only the two NEW local assistant adapters can write.
  const canonical = reviewedIssueFixture()
  const conversation = {
    id: inputScope.conversationId,
    tenantId: scope.tenantId,
    storeId: scope.storeId,
    ownerUserId: scope.actorUserId,
    purpose: "GENERAL",
    status: "ACTIVE",
  }
  const rows: AssistantActionProposal[] = []
  const writes: Array<{ method: string; input: unknown }> = []
  const reads: Array<{ method: string; input: unknown }> = []
  const control = {
    loseCAS: false,
    corruptReadback: false,
    expireReadback: false,
  }
  function matchingRow(where: unknown) {
    return rows.find((row) => matches({ ...row, conversation }, where)) ?? null
  }
  const assistant = {
    assistantConversation: {
      findFirst: async (input: unknown) =>
        project(
          matches(conversation, field(input, "where")) ? conversation : null,
          field(input, "select"),
        ),
    },
    assistantActionProposal: {
      findFirst: async (input: unknown) => {
        reads.push({ method: "findFirst", input })
        const row = matchingRow(field(input, "where"))
        if (row && control.expireReadback)
          setSystemTime(new Date(row.expiresAt))
        return row && control.corruptReadback
          ? { ...row, targetRevision: "f".repeat(64) }
          : row
      },
      findUnique: async (input: unknown) => {
        reads.push({ method: "findUnique", input })
        const where = field(input, "where")
        const unique = field(where, "tenantId_actorUserId_idempotencyKey")
        return matchingRow(unique ?? where)
      },
      create: async (input: unknown) => {
        const data = field(input, "data")
        if (field(data, "status") !== "PENDING")
          throw Error("Only proposal staging allowed")
        if (
          rows.some(
            (row) =>
              row.id === field(data, "id") ||
              (row.tenantId === field(data, "tenantId") &&
                row.actorUserId === field(data, "actorUserId") &&
                row.idempotencyKey === field(data, "idempotencyKey")),
          )
        )
          throw Error("Unique proposal identity violation")
        const row: AssistantActionProposal = {
          id: string(data, "id"),
          conversationId: string(data, "conversationId"),
          tenantId: string(data, "tenantId"),
          storeId: string(data, "storeId"),
          actorUserId: string(data, "actorUserId"),
          action: string(data, "action"),
          actionVersion: number(data, "actionVersion"),
          payload: generalQuoteIssueDraftPayload.parse(field(data, "payload")),
          payloadHash: string(data, "payloadHash"),
          revision: number(data, "revision"),
          targetRecordId: string(data, "targetRecordId"),
          targetRevision: string(data, "targetRevision"),
          roleSnapshot: string(data, "roleSnapshot"),
          approvalTokenHash: string(data, "approvalTokenHash"),
          expiresAt: date(data, "expiresAt"),
          idempotencyKey: string(data, "idempotencyKey"),
          status: "PENDING",
          executedResult: null,
          errorCode: null,
          decidedAt: null,
          createdAt: new Date(),
          updatedAt: new Date(),
        }
        writes.push({ method: "create", input })
        rows.push(row)
        return structuredClone(row)
      },
      updateMany: async (input: unknown) => {
        writes.push({ method: "updateMany", input })
        const row = matchingRow(field(input, "where"))
        if (!row || control.loseCAS) return { count: 0 }
        const data = field(input, "data")
        Object.assign(row, {
          payload: generalQuoteIssueDraftPayload.parse(field(data, "payload")),
          payloadHash: string(data, "payloadHash"),
          revision: number(data, "revision"),
          roleSnapshot: string(data, "roleSnapshot"),
          targetRecordId: string(data, "targetRecordId"),
          targetRevision: string(data, "targetRevision"),
          expiresAt: date(data, "expiresAt"),
          approvalTokenHash: string(data, "approvalTokenHash"),
          updatedAt: new Date(),
        })
        return { count: 1 }
      },
    },
  }
  const tx = new Proxy(canonical.tx, {
    get(target, key) {
      if (key === "assistantConversation")
        return assistant.assistantConversation
      if (key === "assistantActionProposal")
        return assistant.assistantActionProposal
      return Reflect.get(target, key)
    },
  })
  async function create(
    raw: unknown = payload(),
    serverIds = ids,
    context = inputScope,
    signing = secret,
  ): Promise<
    Awaited<ReturnType<typeof createGeneralQuoteIssueDraftInTransaction>>
  > {
    return Reflect.apply(createGeneralQuoteIssueDraftInTransaction, undefined, [
      tx,
      { ...context, payload: raw },
      serverIds,
      signing,
    ])
  }
  async function read(
    context = inputScope,
    draftRef = ids.proposalId,
    signing = secret,
  ): Promise<
    Awaited<ReturnType<typeof readGeneralQuoteIssueDraftInTransaction>>
  > {
    return Reflect.apply(readGeneralQuoteIssueDraftInTransaction, undefined, [
      tx,
      { ...context, draftRef },
      signing,
    ])
  }
  async function edit(
    raw: unknown,
    context = inputScope,
    signing = secret,
  ): Promise<
    Awaited<ReturnType<typeof editGeneralQuoteIssueDraftInTransaction>>
  > {
    return Reflect.apply(editGeneralQuoteIssueDraftInTransaction, undefined, [
      tx,
      { ...context, request: raw },
      signing,
    ])
  }
  function row() {
    const item = rows[0]
    if (!item) throw Error("Expected saved proposal")
    return item
  }
  return {
    canonical,
    conversation,
    rows,
    writes,
    reads,
    control,
    create,
    read,
    edit,
    row,
  }
}
function patch(revision = 1) {
  return {
    draftRef: ids.proposalId,
    expectedRevision: revision,
    edit: { kind: "set_expiry", expiresAt: "2027-01-01T10:00:00.123Z" },
  }
}

test("actual owned GENERAL proposal stages one fully bound canonical review with no token or giant payload returned", async () => {
  const f = fixture()
  const result = await f.create()
  expect(Object.keys(result).sort()).toEqual([
    "draftRef",
    "expiresAt",
    "revision",
    "status",
  ])
  expect(result).toMatchObject({
    draftRef: ids.proposalId,
    revision: 1,
    status: "PENDING",
  })
  const row = f.row()
  expect(row.payloadHash).toBe(proposalDigest(payload()))
  expect(row.approvalTokenHash).toBe(
    proposalDigest(proposalApprovalToken(row, secret)),
  )
  expect(row.expiresAt.getTime() - row.createdAt.getTime()).toBeGreaterThan(
    899_000,
  )
  expect(row.roleSnapshot).toBe("OWNER")
  expect(row.targetRecordId).toBe("request-1")
  const read = await f.read()
  if (row.targetRecordId === null || row.targetRevision === null)
    throw Error("Expected the exact saved quotation review target")
  expect(read.review.target).toEqual({
    id: row.targetRecordId,
    revision: row.targetRevision,
  })
  expect(read.nativeInput.clientVersionId).toMatch(/^assistant_quote_version_/)
  expect(read.payload).toEqual(payload())
  expect(f.writes.map((write) => write.method)).toEqual(["create"])
  expect(f.canonical.writes).toEqual([])
  expect(f.canonical.denied).toEqual([])
  expect(network).not.toHaveBeenCalled()
})

test("creation retry requires the exact server proposal/key/action/payload and never creates a second row", async () => {
  const f = fixture()
  const first = await f.create()
  expect(await f.create()).toEqual(first)
  expect(f.writes).toHaveLength(1)
  await expect(
    f.create(payload(), { ...ids, proposalId: "other-proposal" }),
  ).rejects.toMatchObject({ reason: "idempotency_conflict" })
  await expect(
    f.create(payload(), { ...ids, idempotencyKey: "other-key" }),
  ).rejects.toMatchObject({ reason: "idempotency_conflict" })
  const changed = payload()
  const firstOption = changed.intent.options[0]
  if (!firstOption) throw Error("Expected saved choice")
  firstOption.label = "Different business intent"
  await expect(f.create(changed)).rejects.toMatchObject({
    reason: "idempotency_conflict",
  })
  await expect(
    f.create({ ...payload(), action: "commerce_quote_revise" }),
  ).rejects.toMatchObject({ reason: "invalid_input" })
  expect(f.rows).toHaveLength(1)
  expect(f.writes).toHaveLength(1)
})

test("strict scope/conversation ownership, active GENERAL purpose and source authority refuse before staging", async () => {
  for (const defect of [
    "owner",
    "tenant",
    "store",
    "purpose",
    "status",
    "source",
    "membership",
    "terms",
    "clinical",
  ]) {
    const f = fixture()
    let raw = payload()
    if (defect === "owner") f.conversation.ownerUserId = "foreign"
    if (defect === "tenant") f.conversation.tenantId = "foreign"
    if (defect === "store") f.conversation.storeId = "foreign"
    if (defect === "purpose") f.conversation.purpose = "SETUP"
    if (defect === "status") f.conversation.status = "ARCHIVED"
    if (defect === "source") f.canonical.state.sourceRow.status = "WITHDRAWN"
    if (defect === "membership") f.canonical.state.member.status = "SUSPENDED"
    if (defect === "terms") f.canonical.state.terms = false
    if (defect === "clinical") {
      raw = generalQuoteIssueDraftPayload.parse({
        action: "commerce_quote_issue",
        intent: {
          source: { kind: "commerce_inquiry", id: "inquiry-1" },
          operation: { kind: "issue" },
          options: [
            {
              label: "Choice",
              availabilityOutcome: "unavailable",
              lines: [
                { outcome: "unavailable", sourceLineId: "inquiry-line-1" },
              ],
            },
          ],
        },
      })
      f.canonical.state.inquiry.vertical = "PHARMACY"
    }
    await expect(f.create(raw)).rejects.toThrow()
    expect(f.rows).toEqual([])
    expect(f.writes).toEqual([])
    expect(f.canonical.writes).toEqual([])
  }
})

test("fresh full source/authority drift invalidates reads; explicit edit rebinds new review and invalidates old signature", async () => {
  const f = fixture()
  await f.create()
  const before = await f.read()
  const oldRow = structuredClone(f.row())
  const oldToken = proposalApprovalToken(oldRow, secret)
  f.canonical.state.sourceRow.details = "Changed saved source details"
  await expect(f.read()).rejects.toMatchObject({ reason: "stale_review" })
  await f.edit(patch())
  const after = await f.read()
  expect(after.row.revision).toBe(2)
  expect(after.row.idempotencyKey).toBe(oldRow.idempotencyKey)
  expect(after.nativeInput.clientQuoteId).toBe(before.nativeInput.clientQuoteId)
  expect(after.nativeInput.clientVersionId).toBe(
    before.nativeInput.clientVersionId,
  )
  expect(after.review.target.revision).not.toBe(oldRow.targetRevision)
  expect(after.row.approvalTokenHash).not.toBe(oldRow.approvalTokenHash)
  expect(isProposalApprovalValid(after.row, oldToken, secret)).toBe(false)
  expect(
    isProposalApprovalValid(
      after.row,
      proposalApprovalToken(after.row, secret),
      secret,
    ),
  ).toBe(true)
  f.canonical.state.member.status = "SUSPENDED"
  await expect(f.read()).rejects.toThrow()
  await expect(f.edit(patch(2))).rejects.toThrow()
  expect(f.row().revision).toBe(2)
  expect(f.canonical.writes).toEqual([])
})

test("fresh persisted role replaces the role snapshot only through a new exact review and revision", async () => {
  const f = fixture()
  await f.create()
  f.canonical.state.member.role = "ADMIN"
  await expect(f.read()).rejects.toMatchObject({ reason: "stale_review" })
  await f.edit(patch())
  const saved = await f.read()
  expect(saved.row.roleSnapshot).toBe("ADMIN")
  expect(saved.row.revision).toBe(2)
  expect(saved.review.review.authority.actor.role).toBe("ADMIN")
  expect(f.canonical.writes).toEqual([])
})

test("foreign exact read/edit scope and a wrong signing key cannot reuse the saved private draft", async () => {
  const f = fixture()
  await f.create()
  const before = structuredClone(f.row())
  for (const changed of [
    { actorUserId: "foreign" },
    { tenantId: "foreign" },
    { storeId: "foreign" },
    { conversationId: "foreign" },
  ]) {
    await expect(f.read({ ...inputScope, ...changed })).rejects.toThrow()
    await expect(
      f.edit(patch(), { ...inputScope, ...changed }),
    ).rejects.toThrow()
  }
  await expect(
    f.read(inputScope, ids.proposalId, "wrong-valid-length-key".repeat(3)),
  ).rejects.toMatchObject({ reason: "invalid_binding" })
  await expect(
    f.edit(patch(), inputScope, "wrong-valid-length-key".repeat(3)),
  ).rejects.toMatchObject({ reason: "invalid_binding" })
  expect(f.row()).toEqual(before)
  expect(f.writes).toHaveLength(1)
})

test("current Tenant/access/grant policy and archived saved conversation refuse without proposal edits", async () => {
  for (const defect of [
    "tenant",
    "access-revision",
    "scoped-manager",
    "policy",
    "archived",
  ]) {
    const f = fixture()
    await f.create()
    const before = structuredClone(f.row())
    if (defect === "tenant") f.canonical.state.member.tenant.isActive = false
    if (defect === "access-revision")
      f.canonical.state.member.staffAccessRevision = 0
    if (defect === "scoped-manager") {
      f.canonical.state.member.role = "MANAGER"
      f.canonical.state.member.staffAccessMode = "SCOPED"
    }
    if (defect === "policy") f.canonical.state.policyAllowed = false
    if (defect === "archived") f.conversation.status = "ARCHIVED"
    await expect(f.read()).rejects.toThrow()
    await expect(f.edit(patch())).rejects.toThrow()
    expect(f.row()).toEqual(before)
    expect(f.writes).toHaveLength(1)
    expect(f.canonical.writes).toEqual([])
  }
})

test("expired pending drafts cannot be read/replayed but explicit fresh edit renews the exact draft", async () => {
  const f = fixture()
  try {
    setSystemTime(new Date("2026-10-16T12:00:00Z"))
    await f.create()
    setSystemTime(new Date("2026-10-16T12:15:00Z"))
    await expect(f.read()).rejects.toMatchObject({ reason: "expired" })
    await expect(f.create()).rejects.toMatchObject({ reason: "expired" })
    const renewed = await f.edit(patch())
    expect(renewed.revision).toBe(2)
    expect(renewed.expiresAt).toBe("2026-10-16T12:30:00.000Z")
    expect((await f.read()).row.id).toBe(ids.proposalId)
  } finally {
    setSystemTime()
  }
})

test("terminal, foreign, unsigned and corrupted proposals refuse; stale edit and lost CAS never report success", async () => {
  for (const defect of [
    "terminal",
    "foreign",
    "signature",
    "payload",
    "target",
    "revision",
  ]) {
    const f = fixture()
    await f.create()
    const row = f.row()
    if (defect === "terminal") row.status = "COMPLETED"
    if (defect === "foreign") row.actorUserId = "other"
    if (defect === "signature") row.approvalTokenHash = "0".repeat(64)
    if (defect === "payload") row.payloadHash = "0".repeat(64)
    if (defect === "target") row.targetRevision = "0".repeat(64)
    if (defect === "revision") row.revision = 2_147_483_648
    await expect(f.read()).rejects.toThrow()
    if (defect !== "target") await expect(f.edit(patch())).rejects.toThrow()
    expect(f.writes).toHaveLength(1)
  }
  const f = fixture()
  await f.create()
  await expect(f.edit(patch(2))).rejects.toMatchObject({
    reason: "stale_draft",
  })
  const before = structuredClone(f.row())
  f.control.loseCAS = true
  await expect(f.edit(patch())).rejects.toMatchObject({ reason: "stale_draft" })
  expect(f.row()).toEqual(before)
  const cas = f.writes.find((write) => write.method === "updateMany")
  expect(cas?.input).toMatchObject({
    where: {
      id: ids.proposalId,
      conversationId: inputScope.conversationId,
      ...scope,
      revision: 1,
      status: "PENDING",
      action: "commerce_quote_issue",
      payloadHash: before.payloadHash,
      idempotencyKey: before.idempotencyKey,
    },
  })
})

test("revise loads the exact saved native Quote alias and refuses a different source/current version", async () => {
  const f = fixture()
  const currentVersion = {
    id: "version-original",
    quoteId: "quote-original",
    clientVersionId: "old-command",
    payloadHash: "old-hash",
    version: 1,
    status: "ISSUED",
    expiresAt: null,
    createdByUserId: scope.actorUserId,
    createdAt: new Date("2026-10-01T00:00:00Z"),
    issuedAt: new Date("2026-10-01T00:00:00Z"),
    acceptedAt: null,
    declinedAt: null,
    supersededAt: null,
    revokedAt: null,
    acceptedOrderId: null,
    optionSelection: null,
    quoteApproval: null,
  }
  f.canonical.state.maxVersion = 1
  f.canonical.state.quote = {
    id: currentVersion.quoteId,
    tenantId: scope.tenantId,
    storeId: scope.storeId,
    sourceType: "SERVICE_REQUEST",
    sourceId: "request-1",
    clientQuoteId: "canonical-existing-alias",
    currentVersionId: currentVersion.id,
    currentVersion,
  }
  const raw = generalQuoteIssueDraftPayload.parse({
    ...payload(),
    action: "commerce_quote_revise",
    intent: {
      ...payload().intent,
      operation: {
        kind: "revise",
        quoteId: currentVersion.quoteId,
        quoteVersionId: currentVersion.id,
      },
    },
  })
  await f.create(raw)
  expect(await f.create(raw)).toMatchObject({
    draftRef: ids.proposalId,
    revision: 1,
  })
  const read = await f.read()
  expect(read.nativeInput.clientQuoteId).toBe("canonical-existing-alias")
  expect(read.row.action).toBe("commerce_quote_revise")
  await f.edit(patch())
  expect((await f.read()).nativeInput.clientVersionId).toBe(
    read.nativeInput.clientVersionId,
  )
  expect(
    await f.create(generalQuoteIssueDraftPayload.parse(f.row().payload)),
  ).toMatchObject({ draftRef: ids.proposalId, revision: 2 })
  f.canonical.state.quote.currentVersionId = "another-current-version"
  await expect(f.read()).rejects.toThrow()
  await expect(f.edit(patch(2))).rejects.toThrow()
  const quote = f.canonical.state.quote
  if (!quote) throw Error("Expected original canonical Quote")
  quote.currentVersionId = currentVersion.id
  for (const key of ["sourceId", "tenantId", "storeId", "sourceType"]) {
    const original = quote[key]
    quote[key] = "foreign"
    await expect(f.read()).rejects.toMatchObject({ reason: "stale_review" })
    await expect(f.edit(patch(2))).rejects.toMatchObject({
      reason: "stale_review",
    })
    quote[key] = original
  }
  expect(f.canonical.writes).toEqual([])
})

test("full20by100 payload persists intact and write responses stay compact without domain/provider effects", async () => {
  const f = fixture()
  const base = f.canonical.state.lines[0]
  if (!base) throw Error("Expected source line")
  f.canonical.state.lines = Array.from({ length: 100 }, (_, index) => ({
    ...base,
    id: `line-${index}`,
  }))
  const raw = generalQuoteIssueDraftPayload.parse({
    ...payload(),
    intent: {
      ...payload().intent,
      options: Array.from({ length: 20 }, (_, index) => ({
        label: `Choice ${index}`,
        availabilityOutcome: "unavailable",
        customerNote: "Whole option note",
        fulfilmentPromise: "Explicit promise",
        fulfilmentType: "pickup",
        discountMinor: 0,
        taxMinor: 0,
        fulfilmentFeeMinor: 0,
        lines: f.canonical.state.lines.map((line) => ({
          sourceLineId: line.id,
          outcome: "unavailable",
          customerNote: "\u0001".repeat(500),
        })),
      })),
    },
  })
  const result = await f.create(raw)
  expect(Buffer.byteLength(JSON.stringify(result))).toBeLessThan(512)
  const read = await f.read()
  expect(read.payload).toEqual(raw)
  expect(
    read.review.review.options.map((option) => option.lines.length),
  ).toEqual(Array(20).fill(100))
  expect(read.payload.intent.options).toHaveLength(20)
  expect(f.canonical.writes).toEqual([])
  expect(f.canonical.messages).toEqual([])
  expect(f.canonical.notifications).toEqual([])
  expect(network).not.toHaveBeenCalled()
})

test("weak keys, injected authority, bad IDs and actual readback mismatch fail without exposing a compact success", async () => {
  const f = fixture()
  await expect(
    f.create(payload(), ids, inputScope, "short"),
  ).rejects.toMatchObject({ reason: "signing_unavailable" })
  await expect(
    f.create({ ...payload(), actorUserId: "spoof" }),
  ).rejects.toMatchObject({ reason: "invalid_input" })
  await expect(
    f.create(payload(), { ...ids, proposalId: " padded " }),
  ).rejects.toMatchObject({ reason: "invalid_input" })
  await expect(
    f.create(payload(), ids, { ...inputScope, actorUserId: "x".repeat(129) }),
  ).rejects.toMatchObject({ reason: "invalid_input" })
  expect(f.writes).toEqual([])
  f.control.corruptReadback = true
  await expect(f.create()).rejects.toMatchObject({ reason: "invalid_binding" })
  // The inert adapter does not simulate SQL rollback. Caller-owned transaction
  // rollback is a required connected test; only proposal staging was attempted.
  expect(f.writes.map((write) => write.method)).toEqual(["create"])
  expect(f.canonical.writes).toEqual([])
})

test("untrusted callbacks and hidden getters are never authority or invoked during draft staging", async () => {
  const f = fixture()
  let calls = 0
  function callback(): never {
    calls++
    throw Error("No callback execution")
  }
  const original = payload()
  const getter = Object.defineProperty({ action: original.action }, "intent", {
    get: callback,
  })
  for (const raw of [
    { ...original, authorize: callback },
    { ...original, protectActionId: callback },
    { ...original, toJSON: callback },
    getter,
  ])
    await expect(f.create(raw)).rejects.toThrow()
  expect(calls).toBe(0)
  expect(f.rows).toEqual([])
  expect(f.writes).toEqual([])
  expect(f.canonical.writes).toEqual([])
})

test("oversized logical payload and malformed complete intent refuse before any proposal write", async () => {
  const f = fixture()
  let repeated: unknown = { text: "x".repeat(1024) }
  for (let index = 0; index < 17; index++) repeated = [repeated, repeated]
  await expect(
    f.create({ ...payload(), overflow: repeated }),
  ).rejects.toMatchObject({ reason: "too_large" })
  const malformed = payload()
  malformed.intent.options = []
  await expect(f.create(malformed)).rejects.toMatchObject({
    reason: "invalid_input",
  })
  expect(f.writes).toEqual([])
  expect(f.canonical.writes).toEqual([])
})

test("actual saved readback crossing expiry cannot report a confirmable compact success", async () => {
  const f = fixture()
  try {
    setSystemTime(new Date("2026-10-16T12:00:00Z"))
    f.control.expireReadback = true
    await expect(f.create()).rejects.toMatchObject({ reason: "expired" })
    expect(f.writes.map((write) => write.method)).toEqual(["create"])
    expect(f.canonical.writes).toEqual([])
    // In-memory delegate effects are not a database rollback simulation.
  } finally {
    setSystemTime()
  }
})
