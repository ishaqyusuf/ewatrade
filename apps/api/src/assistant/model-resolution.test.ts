import { describe, expect, test } from "bun:test"
import { createRehearsalModel } from "@ewatrade/ai/rehearsal-model"
import {
  AssistantLiveAiAccessError,
  requireAdultLiveAiAccount,
} from "@ewatrade/db/assistant"
import {
  resolveGeneralAssistantModel,
  resolveSetupAssistantModel,
} from "./model-resolution"

const failIfCalled = () => {
  throw new Error("live provider factory must not be called")
}

test("nonadult live and QA actors cannot resolve a provider or read model configuration", async () => {
  for (const dataClassification of ["LIVE", "QA"] as const) {
    for (const ageBand of [
      "AGE_13_TO_15",
      "AGE_16_TO_17",
      "UNDECLARED",
      null,
    ]) {
      let reads = 0
      await expect(
        resolveGeneralAssistantModel({
          dataClassification,
          authorizeLiveAi: () =>
            requireAdultLiveAiAccount(
              {
                user: {
                  findUnique: async () =>
                    ageBand === null ? null : { ageBand },
                },
              },
              "actor",
            ),
          readRuntimeConfiguration: async () => {
            reads += 1
            return null
          },
          createLiveModel: failIfCalled,
          environment: { APP_ENV: "production" },
        }),
      ).rejects.toMatchObject({ code: "FORBIDDEN" })
      expect(reads).toBe(0)
    }
  }
})

test("the resolved provider transport rechecks after an adult declaration changes", async () => {
  let adult = true
  let checks = 0
  let transport: typeof fetch | undefined
  const model = await resolveSetupAssistantModel({
    dataClassification: "LIVE",
    authorizeLiveAi: async () => {
      checks += 1
      if (!adult) throw new AssistantLiveAiAccessError()
    },
    readRuntimeConfiguration: async () => null,
    environment: { APP_ENV: "production" },
    createLiveModel: (_configuration, options) => {
      transport = options?.fetchImpl
      return {
        model: createRehearsalModel(() => ({ kind: "text", text: "unused" })),
        provider: "deepseek",
        modelId: "deepseek-flash",
        providerOptions: {},
      }
    },
  })
  expect(model?.rehearsal).toBe(false)
  expect(transport).toBeDefined()
  if (!transport) throw new Error("Provider transport was not configured")
  adult = false
  await expect(
    transport("https://provider.invalid/model"),
  ).rejects.toMatchObject({ code: "FORBIDDEN" })
  expect(checks).toBe(2)
})

describe("setup assistant model resolution", () => {
  test("QA assistant chats use DeepSeek even when production requests rehearsal", async () => {
    const model = await resolveSetupAssistantModel({
      authorizeLiveAi: async () => {},
      dataClassification: "QA",
      readRuntimeConfiguration: async () => null,
      environment: {
        DEEPSEEK_API: "sk-live",
        APP_ENV: "production",
        ASSISTANT_REHEARSAL_MODE: "true",
      },
    })
    expect(model?.rehearsal).toBe(false)
    expect(model?.provider).toBe("deepseek")
    expect(model?.modelId).toBe("deepseek-flash")
  })

  test("rehearsal mode is ignored in production for live tenants", async () => {
    let liveCalls = 0
    const model = await resolveSetupAssistantModel({
      authorizeLiveAi: async () => {},
      dataClassification: "LIVE",
      readRuntimeConfiguration: async () => null,
      environment: {
        ASSISTANT_REHEARSAL_MODE: "true",
        APP_ENV: "production",
      },
      createLiveModel: () => {
        liveCalls += 1
        return null
      },
    })
    expect(liveCalls).toBe(1)
    expect(model).toBeNull()
  })

  test("a disabled stored configuration fails closed", async () => {
    const model = await resolveSetupAssistantModel({
      authorizeLiveAi: async () => {},
      dataClassification: "LIVE",
      readRuntimeConfiguration: async () => ({
        enabled: false,
        provider: "DEEPSEEK",
        model: "deepseek-flash",
      }),
      environment: { DEEPSEEK_API: "sk-live" },
      createLiveModel: failIfCalled,
    })
    expect(model).toBeNull()
  })

  test("live tenants without a key are unavailable, not rehearsed", async () => {
    const model = await resolveSetupAssistantModel({
      authorizeLiveAi: async () => {},
      dataClassification: "LIVE",
      readRuntimeConfiguration: async () => null,
      environment: {},
    })
    expect(model).toBeNull()
  })
})

describe("general assistant model resolution", () => {
  test("QA chats use DeepSeek instead of the rehearsal script", async () => {
    const model = await resolveGeneralAssistantModel({
      authorizeLiveAi: async () => {},
      dataClassification: "QA",
      readRuntimeConfiguration: async () => null,
      environment: { DEEPSEEK_API: "sk-live", APP_ENV: "production" },
    })
    expect(model?.rehearsal).toBe(false)
    expect(model?.provider).toBe("deepseek")
  })

  test("QA chats refuse a non-DeepSeek runtime", async () => {
    const model = await resolveGeneralAssistantModel({
      authorizeLiveAi: async () => {},
      dataClassification: "QA",
      readRuntimeConfiguration: async () => ({
        enabled: true,
        provider: "OPENAI",
        model: "gpt-4.1-mini",
      }),
      environment: { OPENAI_API_KEY: "sk-live" },
      createLiveModel: failIfCalled,
    })
    expect(model).toBeNull()
  })

  test("explicit rehearsal outside production stays provider-free", async () => {
    const model = await resolveGeneralAssistantModel({
      authorizeLiveAi: async () => {},
      dataClassification: "QA",
      readRuntimeConfiguration: async () => null,
      environment: { ASSISTANT_REHEARSAL_MODE: "true", DEEPSEEK_API: "sk" },
      createLiveModel: failIfCalled,
    })
    expect(model?.rehearsal).toBe(true)
  })
})
