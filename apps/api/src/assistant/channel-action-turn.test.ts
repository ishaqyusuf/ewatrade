import { expect, test } from "bun:test"
import type { GeneralProposal } from "@ewatrade/assistant/general/contracts"
import { AssistantWhatsAppError } from "@ewatrade/db/assistant-whatsapp"
import {
  WHATSAPP_ACTION_DISABLED_REPLY,
  WHATSAPP_ACTION_INVALID_REPLY,
  assistantWhatsAppActionResultText,
  defaultChannelActionDependencies,
  processAssistantWhatsAppAction,
} from "./channel-action-turn"
import type { LinkedAssistantIdentity } from "./channel-principal"
import type { GeneralTransactionContext } from "./general-actions"
import type { GeneralContext } from "./general-context"

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
const pending = {
  id: "proposal",
  revision: 2,
  payloadHash: "a".repeat(64),
  tenantId: "tenant",
  storeId: "store",
  actorUserId: "actor",
  expiresAt: new Date(Date.now() + 60_000),
  status: "PENDING",
  executedResult: null,
}
const completed: GeneralProposal = {
  id: pending.id,
  revision: 2,
  payload: { action: "customer_create", name: "Amina" },
  status: "COMPLETED",
  expiresAt: pending.expiresAt.toISOString(),
  receipt: {
    kind: "customer",
    recordId: "internal-customer",
    title: "Customer created",
    detail: "Amina · saved customer contact",
  },
}

function fixture(
  options: {
    enabled?: boolean
    invalid?: boolean
    consumed?: boolean
    pendingRecovery?: boolean
    refuse?: boolean
    receipt?: GeneralProposal["receipt"]
  } = {},
) {
  const session = {
    principal,
    inboxLease: lease,
    user: { id: "actor" },
    session: null,
    purpose: "GENERAL",
  }
  const calls: string[] = []
  const writes: Array<Record<string, unknown>> = []
  const inbox = {
    id: lease.inboxId,
    kind: "ACTION",
    bindingId: "binding",
    identityId: null,
    phoneNumberId: principal.phoneNumberId,
    expiresAt: pending.expiresAt,
    content: options.invalid
      ? { type: "invalid_action" }
      : {
          type: "action",
          decision: "confirm",
          decisionDigest: "b".repeat(64),
          replyToMessageId: "wamid.review",
        },
  }
  const row =
    options.consumed && !options.pendingRecovery
      ? { ...pending, status: "COMPLETED", executedResult: completed.receipt }
      : pending
  const db = {
    assistantActionProposal: {
      findFirst: async () => {
        calls.push("proposal")
        return row
      },
    },
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
  const deps = defaultChannelActionDependencies()
  deps.linked = (identity: unknown): identity is LinkedAssistantIdentity =>
    identity === session
  deps.transaction = async <T>(
    _ctx: GeneralContext,
    operation: (context: GeneralTransactionContext) => Promise<T>,
  ) => {
    calls.push("transaction")
    return operation(fresh)
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
      conversation: { id: "conversation", purpose: "GENERAL" },
    } as unknown as Awaited<ReturnType<typeof deps.resolve>>
  }
  deps.authority = async (tx) => {
    expect(tx).toBe(fresh.db)
    return "c".repeat(64)
  }
  deps.writesEnabled = () => options.enabled !== false
  deps.consume = async (tx) => {
    expect(tx).toBe(fresh.db)
    calls.push("consume")
    if (options.refuse) throw new AssistantWhatsAppError("CONFLICT")
    return {
      reviewId: "review",
      proposalId: "proposal",
      revision: 2,
      decision: "confirm",
      alreadyConsumed: Boolean(options.consumed),
      resultRef: options.consumed
        ? {
            proposalId: "proposal",
            revision: 2,
            decision: "confirm",
            status: "COMPLETED",
          }
        : null,
    }
  }
  deps.decide = async (tx, input) => {
    expect(tx).toBe(fresh)
    calls.push("decide")
    expect(input.proposalId).toBe("proposal")
    if (options.consumed) expect(input.approvalToken).toBeUndefined()
    else expect(input.approvalToken).toBeString()
    return options.receipt
      ? { ...completed, receipt: options.receipt }
      : completed
  }
  deps.complete = async (tx) => {
    expect(tx).toBe(fresh.db)
    calls.push("complete-review")
  }
  return { ctx, deps, calls, writes }
}

test("new valid action composes proof, exact canonical effect, completion and reply under one owning transaction", async () => {
  const previous = process.env.ASSISTANT_APPROVAL_SIGNING_KEY
  process.env.ASSISTANT_APPROVAL_SIGNING_KEY =
    "synthetic-action-key-000000000000000000"
  try {
    const f = fixture()
    expect(await processAssistantWhatsAppAction(f.ctx, lease, f.deps)).toEqual({
      status: "completed",
      outboxId: "outbox",
    })
    expect(f.calls).toEqual([
      "transaction",
      "lease",
      "consume",
      "proposal",
      "decide",
      "complete-review",
      "outbox",
      "inbox",
    ])
    expect(f.writes[0]).toMatchObject({
      renderKind: "action_result",
      rendererVersion: "whatsapp-action-result-v1",
      content:
        "Saved in EwaTrade.\n\nCustomer created\n\nAmina · saved customer contact",
    })
    expect(JSON.stringify(f.writes)).not.toContain("approvalToken")
    expect(JSON.stringify(f.writes)).not.toContain("internal-customer")
    expect(f.writes[1]).toMatchObject({
      state: "COMPLETED",
      content: {
        type: "action_result",
        resultRef: {
          proposalId: "proposal",
          revision: 2,
          status: "COMPLETED",
          decision: "confirm",
        },
      },
    })
  } finally {
    if (previous === undefined)
      Reflect.deleteProperty(process.env, "ASSISTANT_APPROVAL_SIGNING_KEY")
    else process.env.ASSISTANT_APPROVAL_SIGNING_KEY = previous
  }
})

test("malformed and disabled actions stage fixed instructions without consuming or reading proposals", async () => {
  for (const options of [{ invalid: true }, { enabled: false }]) {
    const f = fixture(options)
    await processAssistantWhatsAppAction(f.ctx, lease, f.deps)
    expect(f.calls).toEqual(["transaction", "lease", "outbox", "inbox"])
    expect(f.writes[0]?.content).toBe(
      options.invalid
        ? WHATSAPP_ACTION_INVALID_REPLY
        : WHATSAPP_ACTION_DISABLED_REPLY,
    )
    expect(f.writes[1]).toMatchObject({ content: { type: "action_refusal" } })
  }
})

test("consumed proofs recover only exact terminal receipts, never pending effects or original-review completion", async () => {
  const recovered = fixture({ consumed: true })
  await processAssistantWhatsAppAction(recovered.ctx, lease, recovered.deps)
  expect(recovered.calls).toContain("decide")
  expect(recovered.calls).not.toContain("complete-review")
  const pendingRecovery = fixture({ consumed: true, pendingRecovery: true })
  await processAssistantWhatsAppAction(
    pendingRecovery.ctx,
    lease,
    pendingRecovery.deps,
  )
  expect(pendingRecovery.calls).not.toContain("decide")
  expect(pendingRecovery.calls).not.toContain("complete-review")
  expect(pendingRecovery.writes[0]?.content).toBe(WHATSAPP_ACTION_INVALID_REPLY)
})

test("known business refusal retries only a safe fresh instruction; foreign lease never starts a transaction", async () => {
  const refused = fixture({ refuse: true })
  await processAssistantWhatsAppAction(refused.ctx, lease, refused.deps)
  expect(refused.calls.filter((call) => call === "transaction")).toHaveLength(2)
  expect(refused.calls).not.toContain("decide")
  expect(refused.writes[0]?.content).toBe(WHATSAPP_ACTION_INVALID_REPLY)
  const foreign = fixture()
  await expect(
    processAssistantWhatsAppAction(
      foreign.ctx,
      { ...lease, owner: "other" },
      foreign.deps,
    ),
  ).rejects.toMatchObject({ code: "UNAUTHORIZED" })
  expect(foreign.calls).toEqual([])
})

test("receipt presentation preserves canonical text or gives bounded fixed handoff without IDs", () => {
  expect(
    assistantWhatsAppActionResultText({
      ...completed,
      status: "CANCELLED",
      receipt: null,
    }),
  ).toBe("Draft cancelled.")
  const huge = {
    ...completed,
    receipt: {
      kind: "customer" as const,
      recordId: "private-id",
      title: "Created",
      detail: "x".repeat(4000),
    },
  }
  expect(
    assistantWhatsAppActionResultText(
      huge,
      "https://dash.ewatrade.com/assistant/c/chat",
    ),
  ).toBe(
    "Saved in EwaTrade. Open the saved chat for the complete original receipt.\nhttps://dash.ewatrade.com/assistant/c/chat",
  )
})

test("payment-link confirmation stages separate forwardable messages under the same canonical result", async () => {
  const previousOrigin = process.env.PAYMENT_LINK_PUBLIC_ORIGIN
  process.env.PAYMENT_LINK_PUBLIC_ORIGIN = "https://dash.ewatrade.com"
  const previous = process.env.ASSISTANT_APPROVAL_SIGNING_KEY
  process.env.ASSISTANT_APPROVAL_SIGNING_KEY =
    "synthetic-action-key-000000000000000000"
  try {
    const links = Array.from({ length: 5 }, (_, index) => ({
      orderId: `order${index}`,
      orderNumber: `ORD-${index}`,
      customerName: `Customer ${index}`,
      url: `https://dash.ewatrade.com/pay/token${index}`,
      copyText: `Pay order ORD-${index}:\nhttps://dash.ewatrade.com/pay/token${index}`,
      whatsappUrl: null,
      amountMinor: 10000,
      currencyCode: "NGN",
      expiresAt: new Date(Date.now() + 3600000).toISOString(),
    }))
    const f = fixture({
      receipt: {
        kind: "payment_links",
        recordId: "saved-command",
        title: "5 payment links created",
        detail: "Five saved links. Nothing sent.",
        links,
      },
    })
    await processAssistantWhatsAppAction(f.ctx, lease, f.deps)
    const chunks = f.writes.filter((row) => "chunkIndex" in row)
    expect(chunks).toHaveLength(6)
    expect(chunks.map((row) => row.chunkIndex)).toEqual([0, 1, 2, 3, 4, 5])
    expect(chunks.every((row) => row.chunkCount === 6)).toBe(true)
    for (const [index, link] of links.entries())
      expect(chunks[index + 1]?.content).toBe(link.copyText)
    expect(f.calls.filter((call) => call === "decide")).toHaveLength(1)
    expect(f.calls.filter((call) => call === "complete-review")).toHaveLength(1)
  } finally {
    if (previousOrigin === undefined)
      Reflect.deleteProperty(process.env, "PAYMENT_LINK_PUBLIC_ORIGIN")
    else process.env.PAYMENT_LINK_PUBLIC_ORIGIN = previousOrigin
    if (previous === undefined)
      Reflect.deleteProperty(process.env, "ASSISTANT_APPROVAL_SIGNING_KEY")
    else process.env.ASSISTANT_APPROVAL_SIGNING_KEY = previous
  }
})
