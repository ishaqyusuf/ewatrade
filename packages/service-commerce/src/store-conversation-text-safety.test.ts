import { describe, expect, test } from "bun:test"
import {
  StoreConversationTextSafetyError,
  createQaStoreConversationTextSafetyProvider,
  getConfiguredStoreConversationTextSafetyProvider,
  requireStoreConversationTextSafety,
} from "./store-conversation-text-safety"
import {
  OPENAI_TEXT_MODERATION_MODEL,
  createOpenAiStoreConversationTextSafetyProvider,
} from "./store-conversation-text-safety-openai"

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

describe("OpenAI text moderation provider", () => {
  const signal = new AbortController().signal
  const reply = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status })
  const verdict = (flagged: boolean, categories = { hate: flagged }) => ({
    model: OPENAI_TEXT_MODERATION_MODEL,
    results: [{ flagged, categories }],
  })

  test("Production uses it only when selected explicitly with a key", () => {
    expect(
      getConfiguredStoreConversationTextSafetyProvider({
        APP_ENV: "production",
        STORE_CONVERSATION_TEXT_SAFETY_PROVIDER: "openai-moderation",
      }),
    ).toBeNull()
    for (const key of [
      { STORE_CONVERSATION_TEXT_SAFETY_OPENAI_API_KEY: "sk-dedicated" },
      { OPENAI_API_KEY: "sk-shared" },
    ]) {
      expect(
        getConfiguredStoreConversationTextSafetyProvider({
          APP_ENV: "production",
          STORE_CONVERSATION_TEXT_SAFETY_PROVIDER: "openai-moderation",
          ...key,
        }),
      ).not.toBeNull()
    }
    expect(
      getConfiguredStoreConversationTextSafetyProvider({
        APP_ENV: "production",
        OPENAI_API_KEY: "sk-shared",
      }),
    ).toBeNull()
  })

  test("sends the text to the pinned model and maps the verdict", async () => {
    const calls: { url: string; init: RequestInit }[] = []
    const answers = [
      verdict(false),
      verdict(true),
      verdict(false, { hate: true }),
    ]
    const provider = createOpenAiStoreConversationTextSafetyProvider({
      apiKey: "sk-test",
      fetch: async (url, init) => {
        calls.push({ url, init })
        return reply(answers.shift())
      },
    })
    expect(await provider.inspect({ text: "Crate of eggs", signal })).toEqual({
      decision: "allow",
    })
    expect(await provider.inspect({ text: "x", signal })).toEqual({
      decision: "reject",
    })
    expect(await provider.inspect({ text: "x", signal })).toEqual({
      decision: "reject",
    })
    expect(calls[0]?.url).toBe("https://api.openai.com/v1/moderations")
    expect(JSON.parse(String(calls[0]?.init.body))).toEqual({
      model: OPENAI_TEXT_MODERATION_MODEL,
      input: "Crate of eggs",
    })
    expect(
      (calls[0]?.init.headers as Record<string, string>).Authorization,
    ).toBe("Bearer sk-test")
  })

  test("errors, other models and malformed verdicts fail closed without leaking", async () => {
    const bodies: (() => Promise<Response>)[] = [
      async () => reply({ error: { message: "quota sk-test" } }, 429),
      async () => reply({ ...verdict(false), model: "omni-moderation-latest" }),
      async () => reply({ model: OPENAI_TEXT_MODERATION_MODEL, results: [] }),
      async () =>
        reply({
          model: OPENAI_TEXT_MODERATION_MODEL,
          results: [{ flagged: "no", categories: { hate: false } }],
        }),
      async () =>
        reply({
          model: OPENAI_TEXT_MODERATION_MODEL,
          results: [{ flagged: false, categories: {} }],
        }),
      async () => new Response("x".repeat(70 * 1024)),
      async () => {
        throw new Error("network down sk-test")
      },
    ]
    for (const body of bodies) {
      const provider = createOpenAiStoreConversationTextSafetyProvider({
        apiKey: "sk-test",
        fetch: body,
      })
      try {
        await requireStoreConversationTextSafety("hello", provider)
        throw new Error("gate did not reject")
      } catch (error) {
        expect(error).toMatchObject({ kind: "unavailable" })
        expect((error as Error).message).not.toContain("sk-test")
      }
    }
  })

  test("a flagged verdict is rejected by the gate", async () => {
    const provider = createOpenAiStoreConversationTextSafetyProvider({
      apiKey: "sk-test",
      fetch: async () => reply(verdict(true)),
    })
    await expect(
      requireStoreConversationTextSafety("x", provider),
    ).rejects.toMatchObject({ kind: "rejected" })
  })
})
