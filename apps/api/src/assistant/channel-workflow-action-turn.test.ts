import { expect, test } from "bun:test"
import {
  WHATSAPP_WORKFLOW_ACTION_DISABLED_REPLY,
  WHATSAPP_WORKFLOW_ACTION_INVALID_REPLY,
} from "@ewatrade/assistant/channels/workflow-action-result"
import type { WhatsAppWorkflowActionSource } from "@ewatrade/assistant/channels/workflow-action-review"
import type { LinkedAssistantIdentity } from "./channel-principal"
import {
  defaultChannelWorkflowActionDependencies,
  processAssistantWhatsAppWorkflowAction,
} from "./channel-workflow-action-turn"
import type { GeneralTransactionContext } from "./general-actions"
import type { GeneralContext } from "./general-context"
import { WorkflowTurnError } from "./workflow-turn-contract"

const lease = {
  inboxId: "ingress",
  bindingId: "binding",
  owner: "owner",
  generation: 3,
}
const principal = {
  kind: "linked_whatsapp" as const,
  bindingId: "binding",
  grantId: "grant",
  grantGeneration: 1,
  identityGeneration: 1,
  selectionGeneration: 1,
  phoneNumberId: "123456789",
  senderId: "2348000000000",
}
const source: WhatsAppWorkflowActionSource = {
  version: "workflow-action-v1",
  purpose: "SETUP",
  conversationId: "conversation",
  draftId: "draft",
  draftRevision: 7,
  origin: { tenantId: "tenant", storeId: "store" },
  workflowContextHash: null,
  selection: [
    {
      entityId: "entity",
      key: "customer:amina",
      state: "PROPOSED",
      payloadHash: "a".repeat(64),
      commandHash: "b".repeat(64),
    },
  ],
}
function fixture(
  options: {
    enabled?: boolean
    invalid?: boolean
    consumed?: boolean
    cancel?: boolean
    businessError?: boolean
  } = {},
) {
  const session = {
    principal,
    inboxLease: lease,
    user: { id: "actor" },
    session: null,
    purpose: "SETUP",
  }
  const calls: string[] = []
  const writes: Record<string, unknown>[] = []
  let effects = 0
  let consumed = false
  const inbox = {
    id: lease.inboxId,
    kind: "ACTION",
    bindingId: "binding",
    identityId: null,
    phoneNumberId: principal.phoneNumberId,
    expiresAt: new Date(Date.now() + 60000),
    content: options.invalid
      ? { type: "invalid_workflow_action" }
      : {
          type: "workflow_action",
          purpose: "SETUP",
          decision: options.cancel ? "cancel" : "confirm",
          decisionDigest: "c".repeat(64),
          replyToMessageId: "wamid.review",
        },
  }
  const db = {
    assistantWhatsAppOutbox: {
      create: async ({ data }: { data: Record<string, unknown> }) => {
        calls.push("outbox")
        writes.push(data)
        return { id: "outbox" }
      },
    },
    assistantWhatsAppInbox: {
      update: async ({ data }: { data: Record<string, unknown> }) => {
        calls.push("inbox")
        writes.push(data)
        return { id: inbox.id }
      },
    },
  }
  const ctx = { session, db } as unknown as GeneralContext
  const fresh = { session, db } as unknown as GeneralTransactionContext
  const deps = defaultChannelWorkflowActionDependencies()
  deps.linked = (identity: unknown): identity is LinkedAssistantIdentity =>
    identity === session
  deps.transaction = async <T>(
    _context: GeneralContext,
    operation: (context: GeneralTransactionContext) => Promise<T>,
  ) => {
    calls.push("transaction")
    const previous = { effects, consumed, length: writes.length }
    try {
      return await operation(fresh)
    } catch (error) {
      effects = previous.effects
      consumed = previous.consumed
      writes.splice(previous.length)
      throw error
    }
  }
  deps.lease = async (tx) => {
    expect(tx).toBe(fresh.db)
    calls.push("lease")
    return inbox as unknown as Awaited<ReturnType<typeof deps.lease>>
  }
  deps.resolve = async (tx) => {
    expect(tx).toBe(fresh.db)
    return {
      scope: { userId: "actor", tenantId: "tenant", storeId: "store" },
      conversation: { id: "conversation", purpose: "SETUP" },
    } as unknown as Awaited<ReturnType<typeof deps.resolve>>
  }
  deps.authority = async () => "d".repeat(64)
  deps.writesEnabled = () => options.enabled !== false
  deps.consume = async (tx) => {
    expect(tx).toBe(fresh.db)
    calls.push("consume")
    consumed = true
    return {
      reviewId: "review",
      source,
      decision: options.cancel ? "cancel" : "confirm",
      alreadyConsumed: Boolean(options.consumed),
      resultRef: options.consumed
        ? {
            version: "workflow-result-v1",
            purpose: "SETUP",
            conversationId: "conversation",
            draftId: "draft",
            results: [
              {
                entityId: "entity",
                key: "customer:amina",
                state: "COMMITTED",
                recordId: "saved-customer",
                kind: "CUSTOMER",
                name: "Amina",
              },
            ],
          }
        : null,
    }
  }
  deps.execute = async (tx) => {
    expect(tx).toBe(fresh)
    calls.push("execute")
    effects++
    if (options.businessError)
      throw new WorkflowTurnError(
        409,
        "WORKFLOW_REVIEW_CHANGED",
        "Canonical business refusal",
      )
    return {
      purpose: "SETUP",
      conversationId: "conversation",
      draftId: "draft",
      records: [
        {
          entityId: "entity",
          key: "customer:amina",
          kind: "CUSTOMER",
          recordId: "saved-customer",
          name: "Amina",
        },
      ],
    }
  }
  deps.complete = async (tx, input) => {
    expect(tx).toBe(fresh.db)
    expect(input.principal).toEqual(principal)
    calls.push("complete-review")
  }
  return {
    ctx,
    deps,
    calls,
    writes,
    effects: () => effects,
    consumed: () => consumed,
  }
}
test("workflow proof, canonical selected effect, safe receipt/outbox and inbox share owning transaction", async () => {
  const f = fixture()
  expect(
    await processAssistantWhatsAppWorkflowAction(f.ctx, lease, f.deps),
  ).toEqual({ status: "completed", outboxId: "outbox" })
  expect(f.calls).toEqual([
    "transaction",
    "lease",
    "consume",
    "execute",
    "complete-review",
    "outbox",
    "inbox",
  ])
  expect(f.effects()).toBe(1)
  expect(f.writes[0]).toMatchObject({
    renderKind: "workflow_action_result",
    rendererVersion: "whatsapp-workflow-action-result-v1",
  })
  expect(String(f.writes[0]?.content)).toContain("Added customer: Amina")
  expect(String(f.writes[0]?.content)).not.toContain("saved-customer")
  expect(f.writes[1]).toMatchObject({
    state: "COMPLETED",
    content: {
      type: "workflow_action_result",
      reviewId: "review",
      resultRef: { purpose: "SETUP" },
    },
  })
  expect(JSON.stringify(f.writes)).not.toContain("approvalToken")
})
test("cancel and consumed replay produce receipt only and never execute selected commands", async () => {
  for (const options of [{ cancel: true }, { consumed: true }]) {
    const f = fixture(options)
    await processAssistantWhatsAppWorkflowAction(f.ctx, lease, f.deps)
    expect(f.effects()).toBe(0)
    expect(f.calls).not.toContain("execute")
    expect(f.calls.filter((call) => call === "complete-review")).toHaveLength(
      options.cancel ? 1 : 0,
    )
    expect(String(f.writes[0]?.content)).toContain(
      options.cancel ? "Workflow review cancelled" : "Saved in EwaTrade",
    )
  }
})
test("disabled and malformed workflow actions are model-free fixed refusals with no proof or command", async () => {
  for (const options of [{ enabled: false }, { invalid: true }]) {
    const f = fixture(options)
    await processAssistantWhatsAppWorkflowAction(f.ctx, lease, f.deps)
    expect(f.calls).toEqual(["transaction", "lease", "outbox", "inbox"])
    expect(f.writes[0]?.content).toBe(
      options.invalid
        ? WHATSAPP_WORKFLOW_ACTION_INVALID_REPLY
        : WHATSAPP_WORKFLOW_ACTION_DISABLED_REPLY,
    )
    expect(f.writes[1]).toMatchObject({
      content: {
        type: "workflow_action_refusal",
        reason: options.invalid ? "invalid" : "disabled",
      },
    })
  }
})
test("known domain refusal rolls back proof/effect and stages only fresh safe refusal; foreign lease refuses", async () => {
  const f = fixture({ businessError: true })
  await processAssistantWhatsAppWorkflowAction(f.ctx, lease, f.deps)
  expect(f.calls.filter((call) => call === "transaction")).toHaveLength(2)
  expect(f.effects()).toBe(0)
  expect(f.consumed()).toBe(false)
  expect(f.writes).toHaveLength(2)
  expect(f.writes[0]?.content).toBe(WHATSAPP_WORKFLOW_ACTION_INVALID_REPLY)
  const foreign = fixture()
  await expect(
    processAssistantWhatsAppWorkflowAction(
      foreign.ctx,
      { ...lease, inboxId: "foreign" },
      foreign.deps,
    ),
  ).rejects.toThrow()
  expect(foreign.calls).toHaveLength(0)
})
