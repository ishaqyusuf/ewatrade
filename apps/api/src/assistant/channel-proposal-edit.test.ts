import { expect, test } from "bun:test"
import { generalActionSchema } from "@ewatrade/assistant/general/contracts"
import { AssistantWhatsAppError } from "@ewatrade/db/assistant-whatsapp"
import type { LinkedAssistantIdentity } from "./channel-principal"
import {
  createWhatsAppDraftCorrection,
  defaultWhatsAppDraftCorrectionDependencies,
  defaultWhatsAppEditRequestDependencies,
  processAssistantWhatsAppEditRequest,
} from "./channel-proposal-edit"
import type { GeneralTransactionContext } from "./general-actions"
import type { GeneralContext } from "./general-context"

const lease = {
  inboxId: "edit-ingress",
  bindingId: "binding",
  owner: "worker",
  generation: 3,
}
const principal = {
  kind: "linked_whatsapp" as const,
  phoneNumberId: "123456789",
  senderId: "2348000000000",
  bindingId: "binding",
  grantId: "grant",
  identityGeneration: 1,
  grantGeneration: 2,
  selectionGeneration: 3,
}
function fixture(
  options: { consumed?: boolean; stale?: boolean; failOutput?: boolean } = {},
) {
  const operations: string[] = []
  const writes: Record<string, unknown>[] = []
  let edits = 0
  const session = {
    principal,
    purpose: "GENERAL",
    user: { id: "actor" },
    session: null,
  }
  const inbox = {
    id: lease.inboxId,
    kind: "ACTION",
    phoneNumberId: principal.phoneNumberId,
    bindingId: lease.bindingId,
    expiresAt: new Date(Date.now() + 60000),
    content: {
      type: "action_edit",
      decision: "cancel",
      decisionDigest: "a".repeat(64),
      replyToMessageId: "wamid.accepted-review",
    },
  }
  const payload = {
    action: "customer_create" as const,
    name: "Existing Customer",
  }
  const db = {
    assistantWhatsAppInbox: {
      findFirst: async () => inbox,
      update: async ({ data }: { data: Record<string, unknown> }) => {
        writes.push(data)
        return {}
      },
    },
    assistantActionProposal: {
      findFirst: async () => ({ id: "proposal", revision: 7, payload }),
    },
    onboardingSession: {
      updateMany: async ({
        where,
        data,
      }: { where: Record<string, unknown>; data: Record<string, unknown> }) => {
        writes.push({ where, data })
        return { count: 1 }
      },
      create: async ({ data }: { data: Record<string, unknown> }) => {
        writes.push(data)
        return {}
      },
    },
    assistantWhatsAppOutbox: {
      create: async ({ data }: { data: Record<string, unknown> }) => {
        if (options.failOutput) throw Error("Simulated persistence outage")
        writes.push(data)
        return { id: "edit-notice" }
      },
    },
  }
  const ctx = { db, session } as unknown as GeneralContext
  const fresh = ctx as unknown as GeneralTransactionContext
  const deps = defaultWhatsAppEditRequestDependencies()
  deps.linked = (identity: unknown): identity is LinkedAssistantIdentity =>
    identity === session
  deps.transaction = async <T>(
    _ctx: GeneralContext,
    operation: (fresh: GeneralTransactionContext) => Promise<T>,
  ) => {
    const before = { length: writes.length, edits }
    try {
      return await operation(fresh)
    } catch (error) {
      writes.splice(before.length)
      edits = before.edits
      throw error
    }
  }
  deps.lease = async () =>
    inbox as unknown as Awaited<ReturnType<typeof deps.lease>>
  deps.resolve = async () =>
    ({
      principal,
      conversation: { id: "current-chat", purpose: "GENERAL" },
      scope: { userId: "actor", tenantId: "business", storeId: "store" },
      binding: {
        id: "binding",
        identityGeneration: 1,
        grantGeneration: 2,
        selectionGeneration: 3,
      },
    }) as unknown as Awaited<ReturnType<typeof deps.resolve>>
  deps.authority = async () => "b".repeat(64)
  deps.consume = async (_tx, input) => {
    expect(input).toEqual({
      principal,
      decision: "cancel",
      decisionDigest: "a".repeat(64),
      quotedProviderMessageId: "wamid.accepted-review",
      ingressId: inbox.id,
    })
    operations.push("consume-exact-review")
    if (options.stale) throw new AssistantWhatsAppError("CONFLICT")
    return {
      reviewId: "review",
      proposalId: "proposal",
      revision: 7,
      decision: "cancel" as const,
      alreadyConsumed: Boolean(options.consumed),
      resultRef: null,
    }
  }
  deps.edit = async (_fresh, input) => {
    expect(input).toEqual({ proposalId: "proposal", revision: 7, payload })
    operations.push("invalidate-old-revision")
    edits++
    return {
      id: "proposal",
      revision: 8,
      payload,
      expiresAt: new Date(Date.now() + 60000).toISOString(),
      approvalToken: "never-leak-approval",
      status: "PENDING",
      receipt: null,
    }
  }
  deps.complete = async (_tx, _reviewId, _inboxId, result) => {
    writes.push({ reviewResult: result })
    operations.push("complete-edit-receipt")
  }
  return { ctx, deps, operations, writes, edits: () => edits }
}

test("native Edit consumes accepted least-authority proof, invalidates old revision, expires older forms and writes only a safe prompt", async () => {
  const f = fixture()
  expect(
    await processAssistantWhatsAppEditRequest(f.ctx, lease, f.deps),
  ).toEqual({ status: "completed", outboxId: "edit-notice" })
  expect(f.operations).toEqual([
    "consume-exact-review",
    "invalidate-old-revision",
    "complete-edit-receipt",
  ])
  expect(f.edits()).toBe(1)
  const intent = f.writes.find((write) =>
    String(write.token ?? "").startsWith("wa-flow_edit_"),
  )
  expect(intent?.formData).toMatchObject({
    kind: "whatsapp_proposal_edit_v1",
    bindingId: "binding",
    proposalId: "proposal",
    revision: 8,
    identityGeneration: 1,
    grantGeneration: 2,
    selectionGeneration: 3,
  })
  expect(
    f.writes.some((write) =>
      JSON.stringify(write).includes("whatsapp_business_flow_v1"),
    ),
  ).toBe(true)
  expect(JSON.stringify(f.writes)).not.toContain("never-leak-approval")
  expect(
    f.writes.find((write) => write.renderKind === "action_edit_result")
      ?.content,
  ).toContain("older Confirm and Cancel options no longer work")
})

function boundCorrectionFixture(options: { failConsume?: boolean } = {}) {
  const f = fixture()
  const fresh = f.ctx as unknown as GeneralTransactionContext
  const payload = generalActionSchema.parse({
    action: "customer_create",
    name: "Original Customer",
  })
  const source = {
    intentId: "exact-intent",
    intentDigest: "a".repeat(64),
    intentTokenDigest: "b".repeat(64),
    intentExpiresAt: 1800000000000,
    principalDigest: "c".repeat(64),
    proposalId: "exact-proposal",
    revision: 8,
    payloadHash: "d".repeat(64),
    conversationId: "exact-chat",
    tenantId: "business",
    storeId: "store",
    actorUserId: "actor",
  }
  let current: { source: typeof source; payload: typeof payload } | null = {
    source,
    payload,
  }
  let edits = 0
  let consumes = 0
  const dependencies = defaultWhatsAppDraftCorrectionDependencies()
  dependencies.read = async () => current
  dependencies.transaction = async <T>(
    _ctx: GeneralContext,
    operation: (context: GeneralTransactionContext) => Promise<T>,
  ) => {
    const before = { edits, consumes }
    try {
      return await operation(fresh)
    } catch (error) {
      edits = before.edits
      consumes = before.consumes
      throw error
    }
  }
  dependencies.edit = async (context, input) => {
    expect(context).toBe(fresh)
    expect(input.proposalId).toBe(source.proposalId)
    expect(input.revision).toBe(source.revision)
    edits++
    return {
      id: input.proposalId,
      revision: input.revision + 1,
      payload: input.payload,
      status: "PENDING",
      expiresAt: new Date(1800000000000).toISOString(),
      receipt: null,
    }
  }
  dependencies.consume = async (context, proof) => {
    expect(context).toBe(fresh)
    expect(proof).toEqual(source)
    if (options.failConsume) throw Error("Intent consumption failed")
    consumes++
  }
  return {
    ctx: f.ctx,
    source,
    payload,
    correction: createWhatsAppDraftCorrection(dependencies),
    change: (change: Partial<typeof source>) => {
      current = { source: { ...source, ...change }, payload }
    },
    clear: () => {
      current = null
    },
    effects: () => ({ edits, consumes }),
  }
}

test("native model read hides identity and binds one edit/consume to the exact read source", async () => {
  const f = boundCorrectionFixture()
  const safe = await f.correction.read(f.ctx)
  expect(safe).toEqual({ status: "editing", payload: f.payload })
  expect(JSON.stringify(safe)).not.toContain("exact-proposal")
  expect(JSON.stringify(safe)).not.toContain("exact-intent")
  expect(JSON.stringify(safe)).not.toContain("approvalToken")
  const result = await f.correction.edit(f.ctx, {
    ...f.payload,
    name: "Updated Customer",
  })
  expect(result.proposalId).toBe("exact-proposal")
  expect(result.revision).toBe(9)
  expect(f.effects()).toEqual({ edits: 1, consumes: 1 })
  await expect(f.correction.edit(f.ctx, f.payload)).rejects.toThrow(
    "Read the exact WhatsApp draft",
  )
  expect(f.effects()).toEqual({ edits: 1, consumes: 1 })
})

test("native correction requires its own read and cannot switch action", async () => {
  const f = boundCorrectionFixture()
  await expect(f.correction.edit(f.ctx, f.payload)).rejects.toThrow(
    "Read the exact WhatsApp draft",
  )
  await f.correction.read(f.ctx)
  await expect(
    f.correction.edit(f.ctx, {
      action: "product_create",
      name: "Egg",
      canonicalUnitName: "Egg",
      priceMinor: 15000,
    }),
  ).rejects.toThrow("Read the exact WhatsApp draft")
  expect(f.effects()).toEqual({ edits: 0, consumes: 0 })
})

test("native correction rejects every changed intent, generation/provenance digest and proposal binding", async () => {
  for (const change of [
    { intentId: "different-intent" },
    { intentDigest: "e".repeat(64) },
    { intentTokenDigest: "e".repeat(64) },
    { intentExpiresAt: 1800000000001 },
    { principalDigest: "e".repeat(64) },
    { proposalId: "different-proposal" },
    { revision: 9 },
    { payloadHash: "e".repeat(64) },
    { conversationId: "different-chat" },
    { tenantId: "different-business" },
    { storeId: "different-store" },
    { actorUserId: "different-actor" },
  ]) {
    const f = boundCorrectionFixture()
    await f.correction.read(f.ctx)
    f.change(change)
    await expect(f.correction.edit(f.ctx, f.payload)).rejects.toThrow(
      "editing request changed",
    )
    expect(f.effects()).toEqual({ edits: 0, consumes: 0 })
  }
})

test("a revoked or expired native target cannot fall through to another draft", async () => {
  const f = boundCorrectionFixture()
  await f.correction.read(f.ctx)
  f.clear()
  await expect(f.correction.edit(f.ctx, f.payload)).rejects.toThrow(
    "editing request changed",
  )
  expect(f.effects()).toEqual({ edits: 0, consumes: 0 })
  expect(await f.correction.read(f.ctx)).toEqual({ status: "none" })
})

test("failed native intent consumption rolls back the canonical edit and consumes the model read", async () => {
  const f = boundCorrectionFixture({ failConsume: true })
  await f.correction.read(f.ctx)
  await expect(f.correction.edit(f.ctx, f.payload)).rejects.toThrow(
    "Intent consumption failed",
  )
  expect(f.effects()).toEqual({ edits: 0, consumes: 0 })
  await expect(f.correction.edit(f.ctx, f.payload)).rejects.toThrow(
    "Read the exact WhatsApp draft",
  )
})

for (const options of [{ consumed: true }, { stale: true }])
  test("stale or reused Edit produces a safe refusal without another revision or intent", async () => {
    const f = fixture(options)
    expect(
      await processAssistantWhatsAppEditRequest(f.ctx, lease, f.deps),
    ).toEqual({ status: "completed", outboxId: "edit-notice" })
    expect(f.edits()).toBe(0)
    expect(f.writes.some((write) => "token" in write)).toBe(false)
    expect(
      f.writes.find((write) => write.renderKind === "action_edit_result")
        ?.content,
    ).toContain("expired, changed or was already used")
  })

test("a persistence failure rolls back the revision and edit intent with the accepted proof", async () => {
  const f = fixture({ failOutput: true })
  await expect(
    processAssistantWhatsAppEditRequest(f.ctx, lease, f.deps),
  ).rejects.toThrow("Simulated persistence outage")
  expect(f.edits()).toBe(0)
  expect(f.writes).toEqual([])
})
