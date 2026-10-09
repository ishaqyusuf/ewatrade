import { describe, expect, test } from "bun:test"
import { createRehearsalModel } from "@ewatrade/ai/rehearsal-model"
import type { ResolvedAssistantModel } from "./model-resolution"
import { writeSetupMessage } from "./setup-opening"

const live: ResolvedAssistantModel = {
  model: createRehearsalModel(() => ({ kind: "text", text: "unused" })),
  provider: "deepseek",
  modelId: "deepseek-flash",
  providerOptions: {},
  rehearsal: false,
}

const fallback = "Welcome! Nothing here is compulsory. What do you sell?"

function generating(result: unknown) {
  return (async () => result) as never
}

describe("setup opening and welcome writer", () => {
  test("QA rehearsal and a missing provider use the template without a call", async () => {
    let calls = 0
    const generate = (async () => {
      calls += 1
      return {}
    }) as never
    const rehearsal = await writeSetupMessage({
      model: { ...live, rehearsal: true, provider: "ewatrade-rehearsal" },
      instructions: "x",
      fallback,
      generate,
    })
    const none = await writeSetupMessage({
      model: null,
      instructions: "x",
      fallback,
      generate,
    })
    expect(calls).toBe(0)
    expect(rehearsal).toMatchObject({
      text: fallback,
      source: "fallback",
      provider: "ewatrade-rehearsal",
    })
    expect(none).toMatchObject({ text: fallback, source: "fallback" })
  })

  test("a model answer is used with its usage", async () => {
    const draft = await writeSetupMessage({
      model: live,
      instructions: "x",
      fallback,
      generate: generating({
        text: "  Welcome, Amina! Let's set up Jawdah Poultry. Nothing is compulsory.  ",
        usage: { inputTokens: 900, outputTokens: 80, totalTokens: 980 },
      }),
    })
    expect(draft).toMatchObject({
      source: "model",
      text: "Welcome, Amina! Let's set up Jawdah Poultry. Nothing is compulsory.",
      provider: "deepseek",
      usage: { totalTokens: 980 },
    })
  })

  test("errors, timeouts and unusable answers fall back", async () => {
    const failing = await writeSetupMessage({
      model: live,
      instructions: "x",
      fallback,
      generate: (async () => {
        throw new Error("provider 503")
      }) as never,
    })
    const slow = await writeSetupMessage({
      model: live,
      instructions: "x",
      fallback,
      timeoutMs: 20,
      generate: (async (options: { abortSignal: AbortSignal }) =>
        new Promise((_resolve, reject) =>
          options.abortSignal.addEventListener("abort", () =>
            reject(new Error("aborted")),
          ),
        )) as never,
    })
    const empty = await writeSetupMessage({
      model: live,
      instructions: "x",
      fallback,
      generate: generating({ text: " ", usage: {} }),
    })
    for (const draft of [failing, slow, empty])
      expect(draft).toMatchObject({ text: fallback, source: "fallback" })
  })
})
