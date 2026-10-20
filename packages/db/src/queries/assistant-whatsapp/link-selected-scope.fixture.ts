import { expect, mock, test } from "bun:test"
import type { Prisma } from "../../../generated/prisma/client"

const actor = {
  userId: "owner",
  sessionId: "fresh-session",
  tenantId: "business-b",
  storeId: "store-b",
  membershipId: "membership-b",
}
const now = new Date("2026-10-20T20:00:00.000Z")
let activeScope = { ...actor }
let selected: { grantId: string; conversationId: string }[] = []

class AssistantWhatsAppError extends Error {
  constructor(readonly code: string) {
    super(code)
  }
}
mock.module("./authority", () => ({
  AssistantWhatsAppError,
  lockWhatsAppWebActor: async () => {},
  requireWhatsAppWebActor: async () => {},
}))
mock.module("./conversations", () => ({
  resolveAssistantWhatsAppConversation: async () => ({ scope: activeScope }),
  selectAssistantWhatsAppConversationInTransaction: async (
    _tx: unknown,
    principal: { grantId: string },
    conversationId: string,
  ) => {
    selected.push({ grantId: principal.grantId, conversationId })
  },
}))
mock.module("./link-welcome", () => ({
  readAssistantWhatsAppLinkWelcomeInTransaction: async () => null,
  stageAssistantWhatsAppLinkClaimInTransaction: async () => {},
  stageAssistantWhatsAppLinkWelcomeInTransaction: async () => null,
}))
mock.module("./queued-work", () => ({
  cancelAssistantWhatsAppQueuedWorkInTransaction: async () => {},
}))

const { confirmAssistantWhatsAppLinkInTransaction } = await import("./link")

async function confirm(scope: typeof actor) {
  activeScope = scope
  selected = []
  const created: unknown[] = []
  const tx = {
    $queryRaw: async () => [],
    $executeRaw: async () => 1,
    assistantWhatsAppLink: {
      findFirst: async () => ({
        id: "link-b",
        claimedSenderId: "2348000000001",
        claimedMessageId: "consent-b",
        phoneNumberId: "123456789",
        cancelledAt: null,
        confirmedAt: null,
        revision: 0,
        expiresAt: new Date(now.getTime() + 60_000),
      }),
      updateMany: async () => ({ count: 1 }),
    },
    assistantWhatsAppIdentity: {
      findUnique: async () => ({
        id: "identity",
        userId: actor.userId,
        revokedAt: null,
      }),
      update: async () => ({
        id: "identity",
        generation: 1,
        activeBindingId: "binding-a",
        phoneNumberId: "123456789",
        senderId: "2348000000001",
      }),
    },
    assistantWhatsAppGrant: {
      findUnique: async () => null,
      upsert: async () => ({
        id: "grant-b",
        generation: 1,
        expiresAt: new Date(now.getTime() + 60_000),
      }),
    },
    assistantWhatsAppBinding: {
      findFirst: async () => ({
        id: "binding-a",
        grantId: "grant-a",
        identityGeneration: 1,
        grantGeneration: 1,
        selectionGeneration: 1,
      }),
    },
    assistantConversation: {
      create: async (input: { data: unknown }) => {
        created.push(input.data)
        return { id: "wa-linked_link-b" }
      },
    },
  }
  await confirmAssistantWhatsAppLinkInTransaction(
    tx as unknown as Prisma.TransactionClient,
    actor,
    { linkId: "link-b", expectedRevision: 0, phoneNumberId: "123456789" },
    now,
  )
  return created
}

test("a valid binding in another business cannot override the new connection consent", async () => {
  const created = await confirm({
    ...actor,
    tenantId: "business-a",
    storeId: "store-a",
    membershipId: "membership-a",
  })
  expect(created).toEqual([
    {
      id: "wa-linked_link-b",
      ownerUserId: actor.userId,
      tenantId: actor.tenantId,
      storeId: actor.storeId,
      purpose: "GENERAL",
      status: "ACTIVE",
    },
  ])
  expect(selected).toEqual([
    { grantId: "grant-b", conversationId: "wa-linked_link-b" },
  ])
})

test("a different Store or membership is also replaced by the exact consented scope", async () => {
  for (const scope of [
    { ...actor, storeId: "store-other" },
    { ...actor, membershipId: "membership-other" },
  ]) {
    expect((await confirm(scope)).length).toBe(1)
    expect(selected.length).toBe(1)
  }
})

test("an existing valid chat in the same consented scope is retained", async () => {
  expect(await confirm({ ...actor })).toEqual([])
  expect(selected).toEqual([])
})
