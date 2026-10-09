import { expect, test } from "bun:test"
import { canUseStoreConversationFreeFormChat } from "./store-conversation-chat-scope"

test.each([
  null,
  undefined,
  "UNDECLARED",
  "AGE_13_TO_15",
  "AGE_16_TO_17",
  "ADULT",
  "unexpected",
])("initial launch eligibility for %s", (ageBand) => {
  expect(
    canUseStoreConversationFreeFormChat({ ageBand, principal: "account" }),
  ).toBe(ageBand === "ADULT")
  expect(
    canUseStoreConversationFreeFormChat({ ageBand, principal: "guest" }),
  ).toBe(false)
})
