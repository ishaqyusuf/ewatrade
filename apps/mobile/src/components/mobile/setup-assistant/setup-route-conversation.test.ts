import { expect, test } from "bun:test"
import { assistantRouteConversation } from "../assistant/assistant-route-conversation"
import {
  matchesSetupRouteConversation,
  setupRouteCacheKey,
} from "./setup-route-conversation"

test("exact Setup cache keys never reuse another chat or the ordinary Store snapshot", () => {
  const scope = JSON.stringify(["actor", "business", "store"])
  expect(setupRouteCacheKey(scope)).toBe(`ewatrade:setup-assistant:v1:${scope}`)
  expect(setupRouteCacheKey(scope, "saved")).not.toBe(setupRouteCacheKey(scope))
  expect(setupRouteCacheKey(scope, "saved")).not.toBe(
    setupRouteCacheKey(scope, "another"),
  )
  expect(setupRouteCacheKey("another-actor", "saved")).not.toBe(
    setupRouteCacheKey(scope, "saved"),
  )
  expect(setupRouteCacheKey(null, "saved")).toBeNull()
  for (const id of ["", " ", "../chat", "chat?other", "a".repeat(129)]) {
    expect(assistantRouteConversation(id).kind).toBe("invalid")
    expect(setupRouteCacheKey(scope, id)).toBeNull()
    expect(
      matchesSetupRouteConversation(
        { conversation: { id, status: "ACTIVE" } },
        id,
      ),
    ).toBe(false)
  }
})

test("cached/server exact Setup state must match the saved active chat; absent ID keeps ordinary behavior", () => {
  const saved = { conversation: { id: "saved", status: "ACTIVE" } }
  expect(matchesSetupRouteConversation(saved, "saved")).toBe(true)
  expect(matchesSetupRouteConversation(saved, "another")).toBe(false)
  expect(matchesSetupRouteConversation({ conversation: null }, "saved")).toBe(
    false,
  )
  expect(matchesSetupRouteConversation(null, "saved")).toBe(false)
  expect(
    matchesSetupRouteConversation(
      { conversation: { id: "saved", status: "COMPLETED" } },
      "saved",
    ),
  ).toBe(false)
  expect(matchesSetupRouteConversation({ conversation: null })).toBe(true)
})
