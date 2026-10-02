import { describe, expect, test } from "bun:test"
import {
  StoreConversationTextSafetyError,
  createQaStoreConversationTextSafetyProvider,
  getConfiguredStoreConversationTextSafetyProvider,
  requireStoreConversationTextSafety,
} from "./store-conversation-text-safety"

describe("Store Conversation text safety gate", () => {
  test("denies posting without a configured provider", async () => {
    await expect(
      requireStoreConversationTextSafety("hello", null),
    ).rejects.toMatchObject({ kind: "unavailable" })
  })

  test("never enables the QA fixture in Production", () => {
    expect(
      getConfiguredStoreConversationTextSafetyProvider({
        APP_ENV: "production",
        STORE_CONVERSATION_TEXT_SAFETY_PROVIDER: "qa-fixture",
      }),
    ).toBeNull()
    expect(
      getConfiguredStoreConversationTextSafetyProvider({
        APP_ENV: "preview",
        DEV_PROFILE: "prod",
        STORE_CONVERSATION_TEXT_SAFETY_PROVIDER: "qa-fixture",
      }),
    ).toBeNull()
  })

  test("requires an explicit non-production QA fixture switch", () => {
    expect(
      getConfiguredStoreConversationTextSafetyProvider({
        APP_ENV: "preview",
        NODE_ENV: "production",
      }),
    ).toBeNull()
    expect(
      getConfiguredStoreConversationTextSafetyProvider({
        APP_ENV: "preview",
        NODE_ENV: "production",
        STORE_CONVERSATION_TEXT_SAFETY_PROVIDER: "qa-fixture",
      }),
    ).not.toBeNull()
  })

  test("only an allow verdict passes", async () => {
    const provider = createQaStoreConversationTextSafetyProvider()
    await expect(
      requireStoreConversationTextSafety("hello", provider),
    ).resolves.toBeUndefined()
    for (const text of ["[[qa-reject]]", "[[qa-review]]"]) {
      await expect(
        requireStoreConversationTextSafety(text, provider),
      ).rejects.toMatchObject({ kind: "rejected" })
    }
  })

  test("provider errors and malformed verdicts fail closed", async () => {
    const failing = {
      inspect: async () => {
        throw new Error("provider secret details")
      },
    }
    const malformed = {
      inspect: async () => ({ decision: "unknown" as "allow" }),
    }
    for (const provider of [failing, malformed]) {
      try {
        await requireStoreConversationTextSafety("hello", provider)
        throw new Error("gate did not reject")
      } catch (error) {
        expect(error).toBeInstanceOf(StoreConversationTextSafetyError)
        expect(error).toMatchObject({ kind: "unavailable" })
        expect((error as Error).message).not.toContain("provider secret")
      }
    }
  })

  test("a stalled provider is canceled and fails closed", async () => {
    let signal: AbortSignal | undefined
    const stalled = {
      inspect: async (input: { signal: AbortSignal }) => {
        signal = input.signal
        return await new Promise<{ decision: "allow" }>(() => {})
      },
    }

    await expect(
      requireStoreConversationTextSafety("hello", stalled, 5),
    ).rejects.toMatchObject({ kind: "unavailable" })
    expect(signal?.aborted).toBe(true)
  })
})

test("local development defaults to the QA screen without activating preview or production", async () => {
  for (const env of [{ APP_ENV: "local" }, { DEV_PROFILE: "local" }]) {
    const provider = getConfiguredStoreConversationTextSafetyProvider(env)
    await expect(
      requireStoreConversationTextSafety("Layers flock", provider),
    ).resolves.toBeUndefined()
    await expect(
      requireStoreConversationTextSafety("[[qa-reject]]", provider),
    ).rejects.toMatchObject({ kind: "rejected" })
  }
  expect(
    getConfiguredStoreConversationTextSafetyProvider({
      APP_ENV: "local",
      DEV_PROFILE: "production",
    }),
  ).toBeNull()
  expect(
    getConfiguredStoreConversationTextSafetyProvider({
      APP_ENV: "local",
      STORE_CONVERSATION_TEXT_SAFETY_PROVIDER: "unconfigured",
    }),
  ).toBeNull()
})
