import { expect, test } from "bun:test"
import { readGeneralConversation } from "@ewatrade/db/assistant-general"
import { matchesAssistantRouteConversation } from "../../../mobile/src/components/mobile/assistant/assistant-route-conversation"

const scope = { userId: "actor", tenantId: "business", storeId: "store" }
const stored = {
  id: "saved-whatsapp-chat",
  tenantId: scope.tenantId,
  storeId: scope.storeId,
  ownerUserId: scope.userId,
  purpose: "GENERAL",
  status: "ACTIVE",
  updatedAt: new Date("2026-10-15T12:00:00.000Z"),
  messages: [{ parts: [{ type: "text", text: "Saved WhatsApp\nquestion" }] }],
}

/** Inert adapter honors the actual scalar WHERE and SELECT, rather than inventing the RPC DTO. */
function database(row: Record<string, unknown>) {
  return {
    assistantConversation: {
      findFirst: async (input: {
        where: Record<string, unknown>
        select: Record<string, unknown>
      }) => {
        if (
          Object.entries(input.where).some(([key, value]) => row[key] !== value)
        )
          return null
        return Object.fromEntries(
          Object.keys(input.select).map((key) => [key, row[key]]),
        )
      },
    },
  } as unknown as Parameters<typeof readGeneralConversation>[0]
}

test("actual canonical conversation projection satisfies the native exact-route guard", async () => {
  // assistant.conversation returns this producer's conversation unchanged.
  const conversation = await readGeneralConversation(
    database(stored),
    scope,
    stored.id,
  )
  expect(conversation).toMatchObject({
    id: stored.id,
    tenantId: scope.tenantId,
    storeId: scope.storeId,
    ownerUserId: scope.userId,
    purpose: "GENERAL",
    status: "ACTIVE",
    updatedAt: stored.updatedAt,
    title: "Saved WhatsApp question",
  })
  expect(conversation).not.toHaveProperty("messages")
  expect(
    matchesAssistantRouteConversation({ conversation }, stored.id, scope),
  ).toBe(true)
  expect(
    matchesAssistantRouteConversation({ conversation }, "another-chat", scope),
  ).toBe(false)
  expect(
    matchesAssistantRouteConversation(
      { conversation: { id: stored.id, title: "Saved WhatsApp question" } },
      stored.id,
      scope,
    ),
  ).toBe(false)
})

test("canonical producer still excludes foreign scope, actor, purpose and inactive chats", async () => {
  for (const patch of [
    { id: "another-chat" },
    { tenantId: "another-business" },
    { storeId: "another-store" },
    { ownerUserId: "another-actor" },
    { purpose: "SETUP" },
    { purpose: "PRODUCT_CREATE" },
    { status: "ARCHIVED" },
  ]) {
    const conversation = await readGeneralConversation(
      database({ ...stored, ...patch }),
      scope,
      stored.id,
    )
    expect(conversation).toBeNull()
    expect(
      matchesAssistantRouteConversation({ conversation }, stored.id, scope),
    ).toBe(false)
  }
})
