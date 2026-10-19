import { describe, expect, test } from "bun:test"
import { createQaStoreConversationTextSafetyProvider } from "@ewatrade/service-commerce/server"
import {
  assertPreparedStoreConversationTexts,
  assertStoreConversationTextScreened,
  prepareStoreConversationTextScreening,
} from "./store-conversation-text-safety"

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

  test("configured screening creates opaque exact-text evidence from a private snapshot only after all text passes", async () => {
    const previous = process.env.STORE_CONVERSATION_TEXT_SAFETY_PROVIDER
    const app = process.env.APP_ENV
    try {
      process.env.APP_ENV = "local"
      process.env.STORE_CONVERSATION_TEXT_SAFETY_PROVIDER = "qa-fixture"
      const texts = ["Original label", "Original second label"]
      const pending = prepareStoreConversationTextScreening(texts)
      texts[1] = "Changed label"
      texts.push("Never screened")
      const proof = await pending
      expect(Object.isFrozen(proof)).toBe(true)
      expect(JSON.stringify(proof)).toBe("{}")
      expect(() =>
        assertPreparedStoreConversationTexts(proof, [
          "Original label",
          "Original second label",
        ]),
      ).not.toThrow()
      for (const text of [
        "Changed label",
        "Never screened",
        " Original label ",
        "original label",
      ])
        expect(() =>
          assertPreparedStoreConversationTexts(proof, [text]),
        ).toThrow("fresh exact-text")
      for (const forged of [null, {}, true, JSON.parse(JSON.stringify(proof))])
        expect(() =>
          Reflect.apply(assertPreparedStoreConversationTexts, undefined, [
            forged,
            ["Original label"],
          ]),
        ).toThrow("fresh exact-text")
      for (const text of ["[[qa-reject]]", "[[qa-review]]"])
        await expect(
          prepareStoreConversationTextScreening(["Allowed", text]),
        ).rejects.toMatchObject({ code: "NOT_READY" })
      process.env.APP_ENV = "production"
      await expect(
        prepareStoreConversationTextScreening(["Allowed"]),
      ).rejects.toMatchObject({ code: "NOT_READY" })
      expect(() =>
        assertPreparedStoreConversationTexts(proof, ["Original label"]),
      ).not.toThrow()
    } finally {
      if (previous === undefined)
        Reflect.deleteProperty(
          process.env,
          "STORE_CONVERSATION_TEXT_SAFETY_PROVIDER",
        )
      else process.env.STORE_CONVERSATION_TEXT_SAFETY_PROVIDER = previous
      if (app === undefined) Reflect.deleteProperty(process.env, "APP_ENV")
      else process.env.APP_ENV = app
    }
  })
})
