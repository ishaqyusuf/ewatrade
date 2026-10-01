import { describe, expect, test } from "bun:test"
import { createQaStoreConversationTextSafetyProvider } from "@ewatrade/service-commerce/server"
import { assertStoreConversationTextScreened } from "./store-conversation-text-safety"

describe("Store Conversation DB text screening boundary", () => {
  test("maps an absent provider to a safe write denial", async () => {
    await expect(
      assertStoreConversationTextScreened("hello", null),
    ).rejects.toMatchObject({
      code: "NOT_READY",
      message: "Messages are paused while safety screening is unavailable.",
    })
  })

  test("does not post QA-rejected or held text", async () => {
    const provider = createQaStoreConversationTextSafetyProvider()
    for (const text of ["[[qa-reject]]", "[[qa-review]]"]) {
      await expect(
        assertStoreConversationTextScreened(text, provider),
      ).rejects.toMatchObject({ code: "NOT_READY" })
    }
    await expect(
      assertStoreConversationTextScreened("hello", provider),
    ).resolves.toBeUndefined()
  })
})
