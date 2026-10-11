import { describe, expect, test } from "bun:test"
import {
  resolveGeneralAssistantModel,
  resolveSetupAssistantModel,
} from "./model-resolution"

const failIfCalled = () => {
  throw new Error("live provider factory must not be called")
}

describe("setup assistant model resolution", () => {
  test("QA assistant chats use DeepSeek even when production requests rehearsal", async () => {
    const model = await resolveSetupAssistantModel({
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
      dataClassification: "QA",
      readRuntimeConfiguration: async () => null,
      environment: { DEEPSEEK_API: "sk-live", APP_ENV: "production" },
    })
    expect(model?.rehearsal).toBe(false)
    expect(model?.provider).toBe("deepseek")
  })

  test("QA chats refuse a non-DeepSeek runtime", async () => {
    const model = await resolveGeneralAssistantModel({
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
      dataClassification: "QA",
      readRuntimeConfiguration: async () => null,
      environment: { ASSISTANT_REHEARSAL_MODE: "true", DEEPSEEK_API: "sk" },
      createLiveModel: failIfCalled,
    })
    expect(model?.rehearsal).toBe(true)
  })
})
