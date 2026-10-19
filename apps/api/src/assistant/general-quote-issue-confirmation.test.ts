import { afterAll, expect, spyOn, test } from "bun:test"
import type { AssistantActionProposal } from "@ewatrade/db/browser"
import * as textSafety from "@ewatrade/service-commerce/server"
import { currentEffectiveLegalPublication } from "@ewatrade/utils/legal-approval"
import {
  field,
  matches,
  project,
  reviewedIssueFixture,
  reviewedIssueScope as scope,
} from "../../../../packages/db/src/queries/test-helpers/commerce-quote-reviewed-issue"
import {
  confirmGeneralQuoteIssueInTransaction,
  inspectGeneralQuoteIssueConfirmationInTransaction,
  prepareGeneralQuoteIssueConfirmation,
} from "./general-quote-issue-confirmation"
import {
  editGeneralQuoteIssueDraftInTransaction,
  generalQuoteIssueDraftPayload,
} from "./general-quote-issue-draft-store"
import { generalQuoteIssueNativeInput } from "./general-quote-issue-intent"
import { proposalApprovalToken, proposalDigest } from "./proposal-security"

// Actual inspection/store/review/authority/preflight/native issuer/recovery. All
// persistence delegates are explicit in-memory stand-ins. No SQL rollback proof.
function noNetwork(): never {
  throw Error("No network/provider in source confirmation fixture")
}
const network = spyOn(globalThis, "fetch").mockImplementation(
  Object.assign(noNetwork, { preconnect: noNetwork }),
)
afterAll(() => network.mockRestore())
const secret = "source-only-confirmation-key-".repeat(3)
const request = {
  conversationId: "general-1",
  draftRef: "proposal-1",
  revision: 1,
  decision: "confirm" as const,
}
let txDepth = 0
async function inTx<T>(run: () => Promise<T>) {
  if (txDepth !== 0) throw Error("Nested synthetic transaction")
  txDepth++
  try {
    return await run()
  } finally {
    txDepth--
  }
}
async function configured<T>(
  run: (production: () => void, local: () => void) => Promise<T>,
) {
  const keys = [
    "APP_ENV",
    "DEV_PROFILE",
    "STORE_CONVERSATION_TEXT_SAFETY_PROVIDER",
  ] as const
  const before = keys.map((key) => [key, process.env[key]] as const)
  const local = () => {
    process.env.APP_ENV = "local"
    process.env.DEV_PROFILE = "local"
    process.env.STORE_CONVERSATION_TEXT_SAFETY_PROVIDER = "qa-fixture"
  }
  const production = () => {
    process.env.APP_ENV = "production"
    process.env.DEV_PROFILE = "production"
  }
  try {
    local()
    return await run(production, local)
  } finally {
    for (const [key, value] of before)
      if (value === undefined) Reflect.deleteProperty(process.env, key)
      else process.env[key] = value
  }
}
function payload() {
  return {
    action: "commerce_quote_issue",
    intent: {
      source: { kind: "service_request", id: "request-1" },
      operation: { kind: "issue" },
      options: [
        {
          label: "Exact original choice",
          availabilityOutcome: "unavailable",
          lines: [
            {
              outcome: "unavailable",
              sourceLineId: "line-1",
              customerNote: "Original customer explanation",
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
  const existingClientQuoteId =
    savedPayload.intent.operation.kind === "revise"
      ? field(canonical.state.quote, "clientQuoteId")
      : undefined
  if (
    existingClientQuoteId !== undefined &&
    typeof existingClientQuoteId !== "string"
  )
    throw Error("Expected exact native Quote alias")
  const nativeInput = generalQuoteIssueNativeInput(savedPayload.intent, scope, {
    clientOperationId: "operation-1",
    ...(existingClientQuoteId ? { existingClientQuoteId } : {}),
  })
  const reviewed = await canonical.review(
    nativeInput,
    currentEffectiveLegalPublication(),
  )
  const conversation = {
    id: request.conversationId,
    tenantId: scope.tenantId,
    storeId: scope.storeId,
    ownerUserId: scope.actorUserId,
    purpose: "GENERAL",
    status: "ACTIVE",
  }
  const row: AssistantActionProposal = {
    id: request.draftRef,
    conversationId: request.conversationId,
    ...scope,
    action: savedPayload.action,
    actionVersion: 1,
    payload: savedPayload,
    payloadHash: proposalDigest(savedPayload),
    revision: 1,
    targetRecordId: reviewed.target.id,
    targetRevision: reviewed.target.revision,
    roleSnapshot: reviewed.review.authority.actor.role,
    approvalTokenHash: "",
    expiresAt: new Date(Date.now() + 15 * 60_000),
    idempotencyKey: "operation-1",
    status: "PENDING",
    executedResult: null,
    errorCode: null,
    decidedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  }
  const token = () => proposalApprovalToken(row, secret)
  const resign = () => {
    row.approvalTokenHash = proposalDigest(token())
  }
  resign()
  const reads: string[] = []
  const writes: Array<{ status: unknown; input: unknown }> = []
  const control = {
    loseClaim: false,
    throwCompletion: false,
    loseCompletion: false,
    corruptCompletedReceipt: false,
  }
  function rowMatches(where: unknown) {
    const updatedAt = field(where, "updatedAt")
    if (
      updatedAt instanceof Date &&
      updatedAt.getTime() !== row.updatedAt.getTime()
    )
      return false
    const expires = field(where, "expiresAt")
    const equal = field(expires, "equals")
    const after = field(expires, "gt")
    if (equal instanceof Date && equal.getTime() !== row.expiresAt.getTime())
      return false
    if (after instanceof Date && row.expiresAt.getTime() <= after.getTime())
      return false
    if (!where || typeof where !== "object") return false
    const rest = Object.fromEntries(
      Object.entries(where).filter(
        ([key]) => !["updatedAt", "expiresAt"].includes(key),
      ),
    )
    return matches({ ...row, conversation }, rest)
  }
  const assistantConversation = {
    findFirst: async (input: unknown) => {
      reads.push("conversation")
      return project(
        matches(conversation, field(input, "where")) ? conversation : null,
        field(input, "select"),
      )
    },
  }
  const assistantActionProposal = {
    findFirst: async (input: unknown) => {
      reads.push("proposal")
      if (!rowMatches(field(input, "where"))) return null
      const result = structuredClone(row)
      if (control.corruptCompletedReceipt && result.status === "COMPLETED")
        result.executedResult = { rawToken: "must-not-escape" }
      return result
    },
    updateMany: async (input: unknown) => {
      const next = field(field(input, "data"), "status")
      if (
        (next === "EXECUTING" && control.loseClaim) ||
        (next === "COMPLETED" && control.loseCompletion)
      )
        return { count: 0 }
      if (next === "COMPLETED" && control.throwCompletion)
        throw Error("Injected late receipt persistence failure")
      if (!rowMatches(field(input, "where"))) return { count: 0 }
      writes.push({ status: next, input })
      const data = field(input, "data")
      if (!data || typeof data !== "object")
        throw Error("Expected exact proposal update")
      for (const [key, value] of Object.entries(data))
        Reflect.set(row, key, value)
      // Model @updatedAt changes on BOTH CAS writes. A stale pre-claim updatedAt
      // in the completion CAS must fail, just as the real column would change.
      row.updatedAt = new Date(row.updatedAt.getTime() + 1)
      return { count: 1 }
    },
  }
  const tx = new Proxy(canonical.tx, {
    get(target, table) {
      const delegate =
        table === "assistantConversation"
          ? assistantConversation
          : table === "assistantActionProposal"
            ? assistantActionProposal
            : Reflect.get(target, table)
      if (typeof delegate !== "object" || delegate === null) return delegate
      return new Proxy(delegate, {
        get(model, method) {
          const operation = Reflect.get(model, method)
          if (typeof operation !== "function") return operation
          return (...args: unknown[]) => {
            if (txDepth !== 1)
              throw Error("Transaction delegate used outside caller TX")
            // The shared Service fixture has Inquiry read delegates only. Add
            // its two actual native persistence operations, with exact tuples.
            if (table === "commerceInquiry" && method === "updateMany") {
              if (!canonical.state.allowWrites) throw Error("Writes disabled")
              expect(args[0]).toEqual({
                where: {
                  id: "inquiry-1",
                  status: "READY_TO_QUOTE",
                  storeId: scope.storeId,
                  tenantId: scope.tenantId,
                },
                data: { revision: { increment: 1 }, status: "QUOTED" },
              })
              if (!matches(canonical.state.inquiry, field(args[0], "where")))
                return Promise.resolve({ count: 0 })
              canonical.writes.push({ table, method, input: args[0] })
              canonical.state.inquiry.revision++
              canonical.state.inquiry.status = "QUOTED"
              return Promise.resolve({ count: 1 })
            }
            if (table === "commerceInquiryAuditEvent" && method === "create") {
              if (!canonical.state.allowWrites) throw Error("Writes disabled")
              expect(args[0]).toEqual({
                data: {
                  actorUserId: scope.actorUserId,
                  fromStatus: "READY_TO_QUOTE",
                  inquiryId: "inquiry-1",
                  storeId: scope.storeId,
                  tenantId: scope.tenantId,
                  toStatus: "QUOTED",
                  type: "QUOTE_ISSUED",
                },
              })
              canonical.writes.push({ table, method, input: args[0] })
              return Promise.resolve({ id: "inquiry-issue-audit" })
            }
            if (table === "commerceQuoteVersion" && method === "findFirst") {
              const input = args[0]
              const historical = canonical.state.history.find((version) =>
                matches(
                  { ...version, quote: canonical.state.quote },
                  field(input, "where"),
                ),
              )
              if (historical)
                return Promise.resolve(
                  project(
                    { ...historical, quote: canonical.state.quote },
                    field(input, "select"),
                  ),
                )
            }
            return Reflect.apply(operation, model, args)
          }
        },
      })
    },
  })
  async function inspect(
    raw: unknown = { ...request, approvalToken: token() },
    serverScope = scope,
    key = secret,
  ): Promise<
    Awaited<
      ReturnType<typeof inspectGeneralQuoteIssueConfirmationInTransaction>
    >
  > {
    return inTx(() =>
      Reflect.apply(
        inspectGeneralQuoteIssueConfirmationInTransaction,
        undefined,
        [tx, serverScope, raw, key],
      ),
    )
  }
  async function confirm(
    handle?: unknown,
    raw: unknown = { ...request, approvalToken: token() },
    serverScope = scope,
    key = secret,
  ): Promise<
    Awaited<ReturnType<typeof confirmGeneralQuoteIssueInTransaction>>
  > {
    return inTx(() =>
      Reflect.apply(confirmGeneralQuoteIssueInTransaction, undefined, [
        tx,
        serverScope,
        raw,
        key,
        handle,
      ]),
    )
  }
  async function edit() {
    return inTx(() =>
      Reflect.apply(editGeneralQuoteIssueDraftInTransaction, undefined, [
        tx,
        {
          ...scope,
          conversationId: request.conversationId,
          request: {
            draftRef: row.id,
            expectedRevision: row.revision,
            edit: {
              kind: "set_option",
              index: 0,
              option: {
                label: "Edited option",
                availabilityOutcome: "unavailable",
                lines: [
                  {
                    outcome: "unavailable",
                    sourceLineId: "line-1",
                    customerNote: "Edited customer explanation",
                  },
                ],
              },
            },
          },
        },
        secret,
      ]),
    )
  }
  async function prepare() {
    const inspected = await inspect()
    if (inspected.kind !== "pending")
      throw Error("Expected exact pending inspection")
    if (txDepth !== 0) throw Error("Preflight must be outside TX")
    const before = canonical.reads.length + reads.length
    const handle = await prepareGeneralQuoteIssueConfirmation(inspected.plan)
    expect(canonical.reads.length + reads.length).toBe(before)
    return { plan: inspected.plan, handle }
  }
  return {
    canonical,
    conversation,
    row,
    reads,
    writes,
    control,
    token,
    resign,
    inspect,
    confirm,
    edit,
    prepare,
    nativeInput,
  }
}

test("actual inspect/outside prepare/fresh confirm persists one safe native receipt with no inside-TX moderation", async () => {
  await configured(async (production, local) => {
    const f = await fixture()
    f.canonical.state.links = [{ conversationId: "linked-conversation" }]
    // Bind the linked set before inspection, using actual canonical review.
    const rebound = await f.canonical.review(
      f.nativeInput,
      currentEffectiveLegalPublication(),
    )
    f.row.targetRevision = rebound.target.revision
    const originalFactory =
      textSafety.getConfiguredStoreConversationTextSafetyProvider
    const depths: number[] = []
    const screening = spyOn(
      textSafety,
      "getConfiguredStoreConversationTextSafetyProvider",
    ).mockImplementation((environment) => {
      depths.push(txDepth)
      if (txDepth !== 0)
        throw Error("Provider configuration requested inside transaction")
      return originalFactory(environment)
    })
    try {
      production()
      const inspection = await f.inspect()
      if (inspection.kind !== "pending") throw Error("Expected signed pending")
      expect(depths).toEqual([])
      expect(JSON.stringify(inspection.plan)).toBe("{}")
      expect(Object.isFrozen(inspection.plan)).toBe(true)
      local()
      const prepared = await prepareGeneralQuoteIssueConfirmation(
        inspection.plan,
      )
      expect(depths.length).toBeGreaterThan(0)
      expect(depths.every((depth) => depth === 0)).toBe(true)
      expect(await prepareGeneralQuoteIssueConfirmation(inspection.plan)).toBe(
        prepared,
      )
      expect(JSON.stringify(prepared)).toBe("{}")
      production()
      f.canonical.state.allowWrites = true
      const result = await f.confirm(prepared)
      expect(result.kind).toBe("completed")
      if (result.kind !== "completed") throw Error("Expected saved receipt")
      expect(result.receipt).toMatchObject({
        quoteId: "quote-new",
        quoteVersionId: "version-new",
        sourceId: "request-1",
        releaseState: "released",
        version: 1,
        optionCount: 1,
      })
      expect(f.writes.map((write) => write.status)).toEqual([
        "EXECUTING",
        "COMPLETED",
      ])
      expect(f.row.executedResult).toEqual(result.receipt)
      expect(f.canonical.savedOptions).toHaveLength(1)
      expect(f.canonical.savedLines).toHaveLength(1)
      expect(f.canonical.messages.map((row) => row.kind)).toEqual([
        "ACTION_MESSAGE",
        "ACCOUNT_INVITATION",
      ])
      expect(f.canonical.notifications).toHaveLength(1)
      expect(JSON.stringify(result)).not.toMatch(
        /token|Token|nativeInput|payloadHash|screened|proof/,
      )
      expect(f.canonical.denied).toEqual([])
      expect(network).not.toHaveBeenCalled()
    } finally {
      screening.mockRestore()
    }
  })
})

test("completed historical recovery skips provider, key rotation, expiry and new issuance readiness", async () => {
  await configured(async (production) => {
    const f = await fixture()
    const { handle } = await f.prepare()
    f.canonical.state.allowWrites = true
    const initial = await f.confirm(handle)
    if (initial.kind !== "completed") throw Error("Expected committed result")
    const nativeWrites = f.canonical.writes.length
    const proposalWrites = f.writes.length
    f.row.expiresAt = new Date(Date.now() - 1)
    f.canonical.state.terms = false
    f.canonical.state.policyAllowed = false
    f.canonical.state.profile.status = "DISABLED"
    f.canonical.state.releasePolicy = {
      mode: "APPROVAL_REQUIRED",
      revision: 99,
      selectedApproverMembershipIds: [],
    }
    f.canonical.state.team = []
    if (!f.canonical.state.version || !f.canonical.state.quote)
      throw Error("Expected saved native original")
    f.canonical.state.version.status = "SUPERSEDED"
    f.canonical.state.quote.currentVersionId = "later-version"
    f.canonical.state.sourceRow.status = "CONVERTED"
    production()
    expect(await f.inspect(request, scope, "rotated".repeat(8))).toEqual(
      initial,
    )
    expect(
      await f.confirm(undefined, request, scope, "rotated".repeat(8)),
    ).toEqual(initial)
    expect(f.canonical.writes).toHaveLength(nativeWrites)
    expect(f.writes).toHaveLength(proposalWrites)
    expect(f.canonical.savedOptions).toHaveLength(1)
  })
})

test("expired pending cancel and CANCELLED recovery need current read authority but no token/provider/key", async () => {
  await configured(async (production) => {
    const f = await fixture()
    f.row.expiresAt = new Date(Date.now() - 1)
    f.resign()
    f.canonical.state.terms = false
    f.canonical.state.policyAllowed = false
    production()
    const cancelled = await f.inspect(
      { ...request, decision: "cancel" },
      scope,
      "",
    )
    expect(cancelled).toEqual({
      kind: "cancelled",
      draftRef: f.row.id,
      revision: 1,
    })
    if (cancelled.kind !== "cancelled")
      throw Error("Expected cancelled original")
    expect(
      await f.confirm(
        undefined,
        { ...request, decision: "cancel" },
        scope,
        "rotated",
      ),
    ).toEqual(cancelled)
    await expect(f.confirm(undefined, request)).rejects.toThrow()
    expect(f.writes.map((write) => write.status)).toEqual(["CANCELLED"])
    expect(f.canonical.writes).toEqual([])
    f.canonical.state.member.status = "SUSPENDED"
    await expect(
      f.inspect({ ...request, decision: "cancel" }),
    ).rejects.toThrow()
  })
})

test("forged, missing or serialized plans/preparations cannot trigger a fallback moderation or native write", async () => {
  await configured(async (production) => {
    const f = await fixture()
    const { plan, handle } = await f.prepare()
    production()
    for (const forged of [null, {}, JSON.parse(JSON.stringify(plan)), true])
      await expect(
        Reflect.apply(prepareGeneralQuoteIssueConfirmation, undefined, [
          forged,
        ]),
      ).rejects.toMatchObject({ reason: "preparation_required" })
    for (const forged of [
      undefined,
      {},
      JSON.parse(JSON.stringify(handle)),
      true,
    ])
      await expect(f.confirm(forged)).rejects.toMatchObject({
        reason: "preparation_required",
      })
    expect(f.writes).toEqual([])
    expect(f.canonical.writes).toEqual([])
  })
})

test("edited/cancelled/expired/scope/key/role/policy/source drift between preflight and confirm cannot issue", async () => {
  await configured(async (production, local) => {
    for (const drift of [
      "edit",
      "cancel",
      "expiry",
      "scope",
      "key",
      "role",
      "policy",
      "source",
      "access",
      "target",
      "identity",
    ]) {
      local()
      const f = await fixture()
      const { handle } = await f.prepare()
      let raw: unknown = { ...request, approvalToken: f.token() }
      let serverScope = scope
      let key = secret
      if (drift === "edit") await f.edit()
      if (drift === "cancel") {
        f.row.status = "CANCELLED"
        f.row.decidedAt = new Date()
      }
      if (drift === "expiry") f.row.expiresAt = new Date(Date.now() - 1)
      if (drift === "scope") serverScope = { ...scope, storeId: "other-store" }
      if (drift === "key") key = "rotated".repeat(8)
      if (drift === "role") f.canonical.state.member.role = "ADMIN"
      if (drift === "policy") f.canonical.state.policyAllowed = false
      if (drift === "source") f.canonical.state.sourceRow.revision++
      if (drift === "access") f.canonical.state.member.staffAccessRevision++
      if (drift === "target") f.row.targetRevision = "f".repeat(64)
      if (drift === "identity") {
        f.row.idempotencyKey = "changed-command"
        raw = { ...request, approvalToken: f.token() }
      }
      production()
      f.canonical.state.allowWrites = true
      await expect(f.confirm(handle, raw, serverScope, key)).rejects.toThrow()
      expect(
        f.writes.filter((write) =>
          ["EXECUTING", "COMPLETED"].includes(String(write.status)),
        ),
      ).toEqual([])
      expect(f.canonical.writes).toEqual([])
    }
  })
})

test("late receipt failure leaves honest synthetic EXECUTING/native state and must roll back in real owning TX", async () => {
  await configured(async (production, local) => {
    for (const failure of ["throw", "cas", "readback"]) {
      local()
      const f = await fixture()
      const { handle } = await f.prepare()
      if (failure === "throw") f.control.throwCompletion = true
      if (failure === "cas") f.control.loseCompletion = true
      if (failure === "readback") f.control.corruptCompletedReceipt = true
      production()
      f.canonical.state.allowWrites = true
      await expect(f.confirm(handle)).rejects.toThrow()
      expect(f.canonical.savedOptions).toHaveLength(1)
      expect(f.canonical.savedLines).toHaveLength(1)
      expect(f.row.status).toBe(
        failure === "readback" ? "COMPLETED" : "EXECUTING",
      )
      if (failure !== "readback") expect(f.row.executedResult).toBeNull()
      const before = f.canonical.writes.length
      await expect(f.confirm(handle)).rejects.toThrow()
      expect(f.canonical.writes).toHaveLength(before)
      expect(f.canonical.denied).toEqual([])
    }
  })
})

test("claim loss has no native effect and retained exact handle succeeds once then recovers idempotently", async () => {
  await configured(async (production) => {
    const f = await fixture()
    const { handle } = await f.prepare()
    production()
    f.canonical.state.allowWrites = true
    f.control.loseClaim = true
    await expect(f.confirm(handle)).rejects.toMatchObject({ reason: "stale" })
    expect(f.row.status).toBe("PENDING")
    expect(f.canonical.writes).toEqual([])
    f.control.loseClaim = false
    const result = await f.confirm(handle)
    const before = f.canonical.writes.length
    expect(await f.confirm(handle)).toEqual(result)
    expect(await f.inspect(request)).toEqual(result)
    expect(f.canonical.writes).toHaveLength(before)
    expect(f.canonical.savedOptions).toHaveLength(1)
    expect(f.canonical.savedLines).toHaveLength(1)
  })
})

test("private approval receipt remains exact when later approved/rejected/superseded without new issuance gates", async () => {
  await configured(async (production, local) => {
    for (const later of ["PENDING", "APPROVED", "REJECTED", "SUPERSEDED"]) {
      local()
      const f = await fixture((canonical) => {
        canonical.state.releasePolicy = {
          mode: "APPROVAL_REQUIRED",
          revision: 3,
          selectedApproverMembershipIds: ["checker-1"],
        }
        canonical.state.team = [
          { capability: "ATTENDANT", membershipId: "member-1" },
          { capability: "QUOTE_APPROVER", membershipId: "checker-1" },
        ]
        return payload()
      })
      const { handle } = await f.prepare()
      f.canonical.state.allowWrites = true
      const result = await f.confirm(handle)
      if (result.kind !== "completed")
        throw Error("Expected exact private preparation")
      expect(result.receipt).toMatchObject({
        status: "DRAFT",
        releaseState: "pending_approval",
        approvalId: "approval-new",
        policyRevision: 3,
        issuedAt: null,
      })
      const version = f.canonical.state.version
      const approval = field(version, "quoteApproval")
      if (!version || !approval || typeof approval !== "object")
        throw Error("Expected saved pending approval")
      Reflect.set(approval, "status", later)
      if (later === "APPROVED") {
        version.status = "ACCEPTED"
        version.issuedAt = new Date()
      }
      if (later === "SUPERSEDED") version.status = "SUPERSEDED"
      f.canonical.state.team = []
      f.canonical.state.terms = false
      f.canonical.state.policyAllowed = false
      production()
      expect(await f.inspect(request, scope, "rotated")).toEqual(result)
      const before = f.canonical.writes.length
      expect(await f.confirm(undefined, request, scope, "rotated")).toEqual(
        result,
      )
      expect(f.canonical.writes).toHaveLength(before)
      Reflect.set(approval, "requesterMembershipId", "other-member")
      await expect(f.inspect(request)).rejects.toMatchObject({
        reason: "saved_result_unavailable",
      })
      expect(f.canonical.messages).toEqual([])
      expect(f.canonical.notifications).toEqual([])
    }
  })
})

test("exact revise aliases and predecessor ownership survive historical version recovery", async () => {
  await configured(async (production) => {
    const f = await fixture((canonical) => {
      canonical.state.version = {
        id: "prior-version",
        quoteId: "quote-original",
        version: 2,
        status: "ISSUED",
        clientVersionId: "prior-command",
        payloadHash: "a".repeat(64),
        createdAt: new Date("2026-10-01T00:00:00Z"),
        expiresAt: null,
        acceptedOrderId: null,
        quoteApproval: null,
      }
      canonical.state.maxVersion = 4
      canonical.state.quote = {
        id: "quote-original",
        tenantId: scope.tenantId,
        storeId: scope.storeId,
        sourceId: "request-1",
        sourceType: "SERVICE_REQUEST",
        clientQuoteId: "canonical-original-alias",
        currentVersionId: "prior-version",
        currentVersion: canonical.state.version,
      }
      return {
        ...payload(),
        action: "commerce_quote_revise",
        intent: {
          ...payload().intent,
          operation: {
            kind: "revise",
            quoteId: "quote-original",
            quoteVersionId: "prior-version",
          },
        },
      }
    })
    const { handle } = await f.prepare()
    f.canonical.state.allowWrites = true
    production()
    const result = await f.confirm(handle)
    expect(result).toMatchObject({
      kind: "completed",
      receipt: {
        operation: "revise",
        quoteId: "quote-original",
        quoteVersionId: "version-new",
        version: 5,
      },
    })
    expect(f.canonical.state.quote?.clientQuoteId).toBe(
      "canonical-original-alias",
    )
    expect(await f.inspect(request, scope, "rotated")).toEqual(result)
    const previous = f.canonical.state.history[0]
    if (!previous) throw Error("Expected retained predecessor")
    previous.quoteId = "other-quote"
    await expect(f.inspect(request)).rejects.toMatchObject({
      reason: "saved_result_unavailable",
    })
  })
})

test("Inquiry uses actual active native issuance workspace but recovery still proves nonclinical SERVICE source", async () => {
  await configured(async (production) => {
    const f = await fixture((canonical) => {
      canonical.state.profile.status = "ACTIVE"
      return {
        ...payload(),
        intent: {
          ...payload().intent,
          source: { kind: "commerce_inquiry", id: "inquiry-1" },
          options: [
            {
              label: "Inquiry choice",
              availabilityOutcome: "unavailable",
              lines: [
                {
                  outcome: "unavailable",
                  sourceLineId: "inquiry-line-1",
                  customerNote: "Original Inquiry explanation",
                },
              ],
            },
          ],
        },
      }
    })
    const { handle } = await f.prepare()
    production()
    f.canonical.state.allowWrites = true
    const result = await f.confirm(handle)
    expect(result).toMatchObject({
      kind: "completed",
      receipt: { sourceType: "commerce_inquiry", sourceId: "inquiry-1" },
    })
    f.canonical.state.profile.status = "DISABLED"
    f.canonical.state.terms = false
    f.canonical.state.policyAllowed = false
    expect(await f.inspect(request, scope, "rotated")).toEqual(result)
    f.canonical.state.inquiry.vertical = "PHARMACY"
    await expect(f.inspect(request)).rejects.toThrow()
  })
})

test("terminal receipts recheck current persisted authority and exact native proof instead of trusting saved success", async () => {
  await configured(async (production, local) => {
    for (const defect of [
      "role",
      "inactive",
      "tenant",
      "access",
      "source",
      "quote-scope",
      "quote-alias",
      "version-alias",
      "native-payload",
      "creator",
      "currency",
      "version",
      "options",
      "created",
      "expiry",
      "issued",
      "receipt-extra",
      "receipt-source",
    ]) {
      local()
      const f = await fixture()
      const { handle } = await f.prepare()
      f.canonical.state.allowWrites = true
      await f.confirm(handle)
      const native = f.canonical.state.version
      const quote = f.canonical.state.quote
      if (!native || !quote) throw Error("Expected exact native original")
      if (defect === "role") f.canonical.state.member.role = "OPERATOR"
      if (defect === "inactive") f.canonical.state.member.status = "SUSPENDED"
      if (defect === "tenant") f.canonical.state.member.tenant.isActive = false
      if (defect === "access") f.canonical.state.member.staffAccessRevision = 0
      if (defect === "source") f.canonical.state.sourceRow.id = "foreign-source"
      if (defect === "quote-scope") quote.storeId = "foreign-store"
      if (defect === "quote-alias") quote.clientQuoteId = "foreign-command"
      if (defect === "version-alias") native.clientVersionId = "foreign-command"
      if (defect === "native-payload") native.payloadHash = "f".repeat(64)
      if (defect === "creator") native.createdByUserId = "foreign-actor"
      if (defect === "currency") native.currencyCode = "USD"
      if (defect === "version") native.version = 2
      if (defect === "options") f.canonical.savedOptions.pop()
      if (defect === "created")
        native.createdAt = new Date("2020-01-01T00:00:00Z")
      if (defect === "expiry")
        native.expiresAt = new Date("2027-01-01T00:00:00Z")
      if (defect === "issued") native.issuedAt = null
      if (defect === "receipt-extra" || defect === "receipt-source") {
        if (!f.row.executedResult || typeof f.row.executedResult !== "object")
          throw Error("Expected stored receipt")
        Reflect.set(
          f.row.executedResult,
          defect === "receipt-extra" ? "rawToken" : "sourceId",
          "must-not-escape",
        )
      }
      production()
      const before = f.canonical.writes.length
      await expect(f.inspect(request, scope, "rotated")).rejects.toThrow()
      await expect(
        f.confirm(undefined, request, scope, "rotated"),
      ).rejects.toThrow()
      expect(f.canonical.writes).toHaveLength(before)
    }
  })
})

test("pending approval validation and unknown request admission fail before preparation or any write", async () => {
  await configured(async (production) => {
    const f = await fixture()
    production()
    for (const raw of [
      request,
      { ...request, approvalToken: "wrong" },
      { ...request, revision: 2, approvalToken: f.token() },
    ])
      await expect(f.inspect(raw)).rejects.toThrow()
    let callbacks = 0
    const hidden = { ...request, approvalToken: f.token() }
    Object.defineProperty(hidden, "draftRef", {
      enumerable: false,
      get() {
        callbacks++
        throw Error("Do not execute")
      },
    })
    const proxy = new Proxy(hidden, {
      get() {
        callbacks++
        throw Error("Do not execute")
      },
    })
    const before = f.reads.length
    for (const raw of [
      hidden,
      proxy,
      { ...request, actorUserId: scope.actorUserId },
      { ...request, manifest: {} },
      { ...request, draftRef: "x".repeat(4096) },
      {
        ...request,
        toJSON() {
          callbacks++
          return request
        },
      },
    ])
      await expect(f.inspect(raw)).rejects.toMatchObject({
        reason: "invalid_request",
      })
    expect(callbacks).toBe(0)
    expect(f.reads).toHaveLength(before)
    expect(f.writes).toEqual([])
    expect(f.canonical.writes).toEqual([])
  })
})

test("actual screening refusal creates no prepared proof or mutation; full20by100 ordinary data remains supported", async () => {
  await configured(async (production) => {
    const refused = await fixture(() => ({
      ...payload(),
      intent: {
        ...payload().intent,
        options: [
          {
            label: "[[qa-reject]]",
            availabilityOutcome: "unavailable",
            lines: [{ outcome: "unavailable", sourceLineId: "line-1" }],
          },
        ],
      },
    }))
    const inspection = await refused.inspect()
    if (inspection.kind !== "pending") throw Error("Expected signed pending")
    await expect(
      prepareGeneralQuoteIssueConfirmation(inspection.plan),
    ).rejects.toThrow()
    expect(refused.writes).toEqual([])
    expect(refused.canonical.writes).toEqual([])
    const f = await fixture((canonical) => {
      const base = canonical.state.lines[0]
      if (!base) throw Error("Expected original")
      canonical.state.lines = Array.from({ length: 100 }, (_, index) => ({
        ...base,
        id: `line-${index}`,
      }))
      return {
        ...payload(),
        intent: {
          ...payload().intent,
          options: Array.from({ length: 20 }, (_, choice) => ({
            label: `Choice${choice}`,
            availabilityOutcome: "unavailable",
            lines: canonical.state.lines.map((source) => ({
              outcome: "unavailable",
              sourceLineId: source.id,
              customerNote: "Saved original unavailable explanation",
            })),
          })),
        },
      }
    })
    const { handle } = await f.prepare()
    production()
    f.canonical.state.allowWrites = true
    expect(await f.confirm(handle)).toMatchObject({
      kind: "completed",
      receipt: { optionCount: 20 },
    })
    expect(f.canonical.savedOptions).toHaveLength(20)
    expect(f.canonical.savedLines).toHaveLength(2000)
    expect(f.canonical.denied).toEqual([])
  })
})
