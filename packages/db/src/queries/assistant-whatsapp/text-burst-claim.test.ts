import { expect, spyOn, test } from "bun:test"
import type { PrismaClient } from "../../../generated/prisma/client"
import * as conversations from "./conversations"
import { claimAssistantWhatsAppInbox } from "./processing"

const start = new Date("2026-10-22T15:00:00Z")
const claimAt = new Date(start.getTime() + 1500)

function harness(control = false) {
  const identity = {
    userId: "user",
    phoneNumberId: "123456789",
    senderId: "2348000000001",
  }
  const binding = {
    id: "binding",
    identityId: "identity",
    grantId: "grant",
    identityGeneration: 1,
    grantGeneration: 1,
    selectionGeneration: 1,
    conversationId: "conversation",
    purpose: "GENERAL",
    identity,
  }
  const make = (sequence: number, text: string) => ({
    id: `in-${sequence}`,
    kind: "TURN",
    state: "PENDING",
    bindingId: "binding",
    identityId: null,
    sequence,
    attempts: 0,
    leaseGeneration: 0,
    receivedAt: new Date(start.getTime() + (sequence - 1) * 300),
    expiresAt: new Date(start.getTime() + (60 - sequence) * 60_000),
    providerMessageId: `wamid-${sequence}`,
    contentDigest: `immutable-digest-${sequence}`,
    content: { type: "text", text },
    requestId: `request-${sequence}`,
    userMessageId: `message-${sequence}`,
    binding,
    leaseExpiresAt: null as Date | null,
    nextAttemptAt: null,
  })
  let head = make(1, "Create product Egg")
  const siblings = [make(2, "Small price: 150 naira")]
  let cancelled = 0
  let candidateReads = 0
  let controlReads = 0
  const db = {
    $transaction: async <T>(run: (tx: unknown) => Promise<T>) => run(db),
    $queryRaw: async () => [],
    assistantWhatsAppInbox: {
      findUnique: async () => structuredClone(head),
      findFirst: async ({
        where,
      }: { where: { kind?: string; identityId?: string } }) => {
        if (where.kind === "CONTROL") {
          controlReads++
          expect(where.identityId).toBe("identity")
          return control ? { id: "intervening-control" } : null
        }
        return { id: head.id }
      },
      findMany: async () => {
        candidateReads++
        return structuredClone(siblings)
      },
      updateMany: async ({
        data,
      }: { data: { state: string; errorCode: string } }) => {
        expect(data.state).toBe("CANCELLED")
        expect(data.errorCode).toBe("TEXT_BURST_MERGED")
        cancelled += siblings.length
        return { count: siblings.length }
      },
      update: async ({ data }: { data: Record<string, unknown> }) => {
        head = {
          ...head,
          ...data,
          attempts: head.attempts + 1,
          leaseGeneration: head.leaseGeneration + 1,
        } as typeof head
        return structuredClone(head)
      },
    },
  }
  return {
    db: db as unknown as PrismaClient,
    stats: () => ({ cancelled, candidateReads, controlReads }),
    expireLease() {
      head.leaseExpiresAt = claimAt
    },
  }
}

async function withAuthority(run: () => Promise<void>) {
  const authority = spyOn(
    conversations,
    "resolveAssistantWhatsAppConversation",
  ).mockResolvedValue({} as never)
  try {
    await run()
  } finally {
    authority.mockRestore()
  }
}

test("an identity control between fragments prevents claim-time merging", async () => {
  await withAuthority(async () => {
    const h = harness(true)
    const result = await claimAssistantWhatsAppInbox(
      h.db,
      "in-1",
      ["user"],
      claimAt,
    )
    expect(result.kind).toBe("claimed")
    if (result.kind !== "claimed") throw Error("Expected claim")
    expect(result.inbox.content).toEqual({
      type: "text",
      text: "Create product Egg",
    })
    expect(h.stats()).toEqual({
      cancelled: 0,
      candidateReads: 1,
      controlReads: 1,
    })
  })
})

test("one claim joins adjacent details, retires sibling work and retains original digest and attribution", async () => {
  await withAuthority(async () => {
    const h = harness()
    const result = await claimAssistantWhatsAppInbox(
      h.db,
      "in-1",
      ["user"],
      claimAt,
    )
    expect(result.kind).toBe("claimed")
    if (result.kind !== "claimed") throw Error("Expected claim")
    expect(result.inbox.content).toEqual({
      type: "text",
      text: "Create product Egg\n\nSmall price: 150 naira",
      burst: { originalText: "Create product Egg", sourceIds: ["in-2"] },
    })
    expect(result.inbox.contentDigest).toBe("immutable-digest-1")
    expect(result.inbox.providerMessageId).toBe("wamid-1")
    expect(result.inbox.expiresAt).toEqual(
      new Date(start.getTime() + 58 * 60_000),
    )
    expect(h.stats().cancelled).toBe(1)
  })
})

test("a recovered lease keeps the exact combined input without absorbing or cancelling more rows", async () => {
  await withAuthority(async () => {
    const h = harness()
    const first = await claimAssistantWhatsAppInbox(
      h.db,
      "in-1",
      ["user"],
      claimAt,
    )
    expect(first.kind).toBe("claimed")
    if (first.kind !== "claimed") throw Error("Expected claim")
    h.expireLease()
    const retry = await claimAssistantWhatsAppInbox(
      h.db,
      "in-1",
      ["user"],
      new Date(claimAt.getTime() + 1),
    )
    expect(retry.kind).toBe("claimed")
    if (retry.kind !== "claimed") throw Error("Expected retry")
    expect(retry.inbox.content).toEqual(first.inbox.content)
    expect(retry.inbox.contentDigest).toBe(first.inbox.contentDigest)
    expect(retry.inbox.attempts).toBe(2)
    expect(h.stats()).toEqual({
      cancelled: 1,
      candidateReads: 1,
      controlReads: 1,
    })
  })
})
