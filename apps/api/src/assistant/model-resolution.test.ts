import { describe, expect, test } from "bun:test"
import { resolveSetupAssistantModel } from "./model-resolution"

const failIfCalled = () => {
  throw new Error("live provider factory must not be called")
}

describe("setup assistant model resolution", () => {
  test("QA tenants always get the provider-free rehearsal model", async () => {
    const model = await resolveSetupAssistantModel({
      dataClassification: "QA",
      readRuntimeConfiguration: async () => failIfCalled(),
      environment: { DEEPSEEK_API: "sk-live" },
      createLiveModel: failIfCalled,
    })
    expect(model?.rehearsal).toBe(true)
    expect(model?.provider).toBe("ewatrade-rehearsal")
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
