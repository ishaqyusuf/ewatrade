import { afterEach, beforeEach, expect, spyOn, test } from "bun:test"
import { WHATSAPP_TURN_MAX_ATTEMPTS } from "@ewatrade/assistant/channels/worker"
import type { Prisma, PrismaClient } from "../../../generated/prisma/client"
import * as conversations from "./conversations"
import * as execution from "./execution"
import * as mediaLifecycle from "./media-source-lifecycle"
import { stageAssistantWhatsAppMissedReplyNoticeInTransaction } from "./outbox"
import {
  claimAssistantWhatsAppInbox,
  settleAssistantWhatsAppInbox,
} from "./processing"

const now = new Date("2026-11-03T14:04:00Z")
const resolved = {
  tenantContext: {
    tenant: { id: "tenant", name: "Mama Ada Provisions" },
    activeStore: { id: "store", name: "Yaba Main" },
  },
  scope: { tenantId: "tenant", storeId: "store", userId: "user" },
  conversation: { id: "conversation", purpose: "GENERAL" },
}
const restore: Array<{ mockRestore(): void }> = []
let mediaCancelled = 0
beforeEach(() => {
  mediaCancelled = 0
  restore.push(
    spyOn(
      conversations,
      "resolveAssistantWhatsAppConversation",
    ).mockResolvedValue(resolved as never),
    spyOn(execution, "assistantWhatsAppAuthorityDigest").mockResolvedValue(
      "authority",
    ),
    spyOn(
      mediaLifecycle,
      "cancelAssistantWhatsAppPendingMediaInTransaction",
    ).mockImplementation(async () => {
      mediaCancelled++
      return undefined as never
    }),
  )
})
afterEach(() => {
  for (const spy of restore.splice(0)) spy.mockRestore()
})

function harness(options: {
  attempts?: number
  state?: string
  executionAuthorityDigest?: string | null
  existingOutbox?: boolean
  run?: { status: string; errorCode: string | null } | null
}) {
  const binding = {
    id: "binding",
    identityId: "identity",
    grantId: "grant",
    identityGeneration: 1,
    grantGeneration: 1,
    selectionGeneration: 1,
    conversationId: "conversation",
    purpose: "GENERAL",
    identity: {
      userId: "user",
      phoneNumberId: "123456789",
      senderId: "2348000000001",
    },
  }
  let inbox = {
    id: "in-1",
    kind: "TURN",
    state: options.state ?? "PENDING",
    bindingId: "binding",
    identityId: null,
    sequence: 1,
    attempts: options.attempts ?? 0,
    leaseGeneration: 1,
    leaseOwner: "owner",
    leaseExpiresAt: new Date(now.getTime() + 60_000) as Date | null,
    receivedAt: new Date(now.getTime() - 60_000),
    expiresAt: new Date(now.getTime() + 3_600_000),
    phoneNumberId: "123456789",
    providerMessageId: "wamid-1",
    requestId: "request-1",
    userMessageId: "message-1",
    content: { type: "text", text: "today's sales" } as unknown,
    executionAuthorityDigest: options.executionAuthorityDigest ?? null,
    nextAttemptAt: null,
    binding,
  }
  const created: Array<Record<string, unknown>> = []
  const db = {
    $transaction: async <T>(run: (tx: unknown) => Promise<T>) => run(db),
    $queryRaw: async () => [],
    assistantRun: {
      findFirst: async () => options.run ?? null,
    },
    assistantWhatsAppOutbox: {
      findFirst: async () => (options.existingOutbox ? { id: "out" } : null),
      create: async ({ data }: { data: Record<string, unknown> }) => {
        created.push(data)
        return data
      },
    },
    assistantWhatsAppInbox: {
      findUnique: async () => structuredClone(inbox),
      findFirst: async () => structuredClone(inbox),
      update: async ({ data }: { data: Record<string, unknown> }) => {
        inbox = { ...inbox, ...data } as typeof inbox
        return structuredClone(inbox)
      },
    },
  }
  return {
    db: db as unknown as PrismaClient,
    created,
    inbox: () => inbox,
  }
}
const lease = {
  inboxId: "in-1",
  bindingId: "binding",
  owner: "owner",
  generation: 1,
}

test("exhausted attempts send one fixed outage notice without a run, draft or reply link", async () => {
  const h = harness({ attempts: WHATSAPP_TURN_MAX_ATTEMPTS })
  const result = await claimAssistantWhatsAppInbox(h.db, "in-1", ["user"], now)
  expect(result).toEqual({ kind: "failed", bindingId: "binding", notice: true })
  expect(h.inbox()).toMatchObject({
    state: "FAILED",
    errorCode: "ATTEMPTS_EXHAUSTED",
    content: { type: "channel_notice", code: "ASSISTANT_UNAVAILABLE" },
    executionAuthorityDigest: "authority",
  })
  expect(h.created).toHaveLength(1)
  expect(h.created[0]).toMatchObject({
    inboxId: "in-1",
    responseRevision: 1,
    chunkIndex: 0,
    chunkCount: 1,
    renderKind: "notice",
    authorityDigest: "authority",
  })
  expect(h.created[0]?.runId).toBeUndefined()
  expect(h.created[0]?.messageId).toBeUndefined()
  expect(h.created[0]?.content).toBe(
    "Mama Ada Provisions · Yaba Main\n\n⚠️ I can't reach your business data right now. Nothing was changed.\nTry again in a minute.",
  )
  expect(mediaCancelled).toBe(1)
})

test("an inbox that already has an outbox row or changed authority gets no second notice", async () => {
  const existing = harness({
    attempts: WHATSAPP_TURN_MAX_ATTEMPTS,
    existingOutbox: true,
  })
  expect(
    await claimAssistantWhatsAppInbox(existing.db, "in-1", ["user"], now),
  ).toEqual({ kind: "failed", bindingId: "binding" })
  expect(existing.created).toHaveLength(0)
  expect(existing.inbox().content).toEqual({
    type: "text",
    text: "today's sales",
  })
  const changed = harness({
    attempts: WHATSAPP_TURN_MAX_ATTEMPTS,
    executionAuthorityDigest: "older-authority",
  })
  expect(
    await claimAssistantWhatsAppInbox(changed.db, "in-1", ["user"], now),
  ).toEqual({ kind: "failed", bindingId: "binding" })
  expect(changed.created).toHaveLength(0)
})

test("a failed settled turn sends the outage notice; budget and bad input outcomes stay silent here", async () => {
  const failed = harness({
    state: "PROCESSING",
    executionAuthorityDigest: "authority",
    run: { status: "FAILED", errorCode: "STREAM_FAILED" },
  })
  expect(
    await settleAssistantWhatsAppInbox(
      failed.db,
      lease,
      { permittedUserIds: ["user"] },
      now,
    ),
  ).toEqual({ state: "FAILED", notice: true })
  expect(failed.inbox()).toMatchObject({
    state: "FAILED",
    errorCode: "STREAM_FAILED",
    content: { type: "channel_notice", code: "ASSISTANT_UNAVAILABLE" },
  })
  expect(failed.created).toHaveLength(1)
  for (const errorCode of ["BUDGET_EXHAUSTED", "BAD_REQUEST"]) {
    const quiet = harness({
      state: "PROCESSING",
      executionAuthorityDigest: "authority",
      run: { status: "FAILED", errorCode },
    })
    expect(
      await settleAssistantWhatsAppInbox(
        quiet.db,
        lease,
        { permittedUserIds: ["user"] },
        now,
      ),
    ).toEqual({ state: "FAILED" })
    expect(quiet.created).toHaveLength(0)
  }
})

function missedHarness(input: { missed: boolean; answered: boolean }) {
  const created: Array<Record<string, unknown>> = []
  const queries: unknown[] = []
  const tx = {
    assistantWhatsAppOutbox: {
      findFirst: async (query: { where: Record<string, unknown> }) => {
        queries.push(query.where)
        if ("state" in query.where)
          return input.missed ? { inbox: { sequence: 4 } } : null
        return input.answered ? { id: "later" } : null
      },
      create: async ({ data }: { data: Record<string, unknown> }) => {
        created.push(data)
        return data
      },
    },
  }
  return { tx: tx as unknown as Prisma.TransactionClient, created, queries }
}
const nextInbox = {
  id: "in-9",
  bindingId: "binding",
  sequence: 9,
  phoneNumberId: "123456789",
  expiresAt: new Date(now.getTime() + 3_600_000),
}

test("a reply missed by the 24-hour window prefaces the next reply once, before the reply", async () => {
  const h = missedHarness({ missed: true, answered: false })
  expect(
    await stageAssistantWhatsAppMissedReplyNoticeInTransaction(
      h.tx,
      nextInbox,
      resolved as never,
      "authority",
    ),
  ).toBe(true)
  expect(h.queries[0]).toMatchObject({
    state: "EXPIRED",
    errorCode: "MESSAGE_WINDOW_CLOSED",
    inbox: { bindingId: "binding", kind: "TURN", sequence: { lt: 9 } },
  })
  expect(h.queries[1]).toEqual({
    OR: [
      { inbox: { bindingId: "binding", sequence: { gt: 4, lt: 9 } } },
      { inboxId: "in-9", responseRevision: 0 },
    ],
  })
  expect(h.created).toEqual([
    expect.objectContaining({
      inboxId: "in-9",
      responseRevision: 0,
      chunkIndex: 0,
      renderKind: "notice",
      authorityDigest: "authority",
      content:
        "👋 Welcome back. My last reply couldn't be delivered because the chat was quiet for over 24 hours. Ask again and I'll answer.",
    }),
  ])
  for (const state of [
    { missed: false, answered: false },
    { missed: true, answered: true },
  ]) {
    const quiet = missedHarness(state)
    expect(
      await stageAssistantWhatsAppMissedReplyNoticeInTransaction(
        quiet.tx,
        nextInbox,
        resolved as never,
        "authority",
      ),
    ).toBe(false)
    expect(quiet.created).toHaveLength(0)
  }
})
