import { expect, test } from "bun:test"
import {
  assistantRouteConversation,
  matchesAssistantRouteConversation,
} from "./assistant-route-conversation"
const scope = { userId: "actor", tenantId: "business", storeId: "store" }
const conversation = {
  id: "saved-chat",
  tenantId: "business",
  storeId: "store",
  ownerUserId: "actor",
  purpose: "GENERAL",
  status: "ACTIVE",
}

test("saved conversation route keeps explicit identity and never treats malformed input as new chat", () => {
  expect(assistantRouteConversation(undefined)).toEqual({ kind: "none" })
  expect(assistantRouteConversation("saved-chat")).toEqual({
    kind: "saved",
    conversationId: "saved-chat",
  })
  for (const value of [
    "",
    " ",
    " saved-chat",
    "../chat",
    "chat?other",
    ".",
    "..",
    "a".repeat(129),
    ["one", "two"],
    "chat\u0000",
  ])
    expect(assistantRouteConversation(value)).toEqual({ kind: "invalid" })
})

test("only exact canonical actor, business, Store, active status and General purpose can satisfy route", () => {
  expect(
    matchesAssistantRouteConversation({ conversation }, "saved-chat", scope),
  ).toBe(true)
  for (const patch of [
    { id: "another-chat" },
    { tenantId: "another-business" },
    { storeId: "another-store" },
    { ownerUserId: "another-actor" },
    { purpose: "SETUP" },
    { purpose: "PRODUCT_CREATE" },
    { status: "ARCHIVED" },
  ])
    expect(
      matchesAssistantRouteConversation(
        { conversation: { ...conversation, ...patch } },
        "saved-chat",
        scope,
      ),
    ).toBe(false)
  expect(
    matchesAssistantRouteConversation({ conversation }, "saved-chat", null),
  ).toBe(false)
  expect(
    matchesAssistantRouteConversation(
      { conversation: { id: "saved-chat" } },
      "saved-chat",
      scope,
    ),
  ).toBe(false)
  expect(matchesAssistantRouteConversation(null, "saved-chat", scope)).toBe(
    false,
  )
})
