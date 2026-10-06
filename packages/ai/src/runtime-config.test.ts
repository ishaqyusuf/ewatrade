import { describe, expect, test } from "bun:test"
import { assistantProviderApiKey } from "./provider"
import { resolveAssistantRuntimeConfiguration } from "./runtime-config"

describe("assistant runtime configuration", () => {
  test("defaults to DeepSeek Flash when nothing is configured", () => {
    expect(resolveAssistantRuntimeConfiguration(undefined, {})).toEqual({
      enabled: true,
      provider: "DEEPSEEK",
      model: "deepseek-flash",
    })
  })

  test("persisted configuration wins and fails closed when invalid or off", () => {
    const env = {
      ASSISTANT_AI_PROVIDER: "openai",
      ASSISTANT_AI_MODEL: "gpt-4.1",
    }
    expect(
      resolveAssistantRuntimeConfiguration(
        { enabled: true, provider: "OPENAI", model: "gpt-4.1-mini" },
        env,
      ),
    ).toMatchObject({ provider: "OPENAI", model: "gpt-4.1-mini" })
    expect(
      resolveAssistantRuntimeConfiguration(
        { enabled: false, provider: "OPENAI", model: "gpt-4.1-mini" },
        env,
      ),
    ).toBeNull()
    expect(
      resolveAssistantRuntimeConfiguration(
        { enabled: true, provider: "OPENAI", model: "unknown" },
        env,
      ),
    ).toBeNull()
  })

  test("environment selects only allowlisted provider/model pairs", () => {
    expect(
      resolveAssistantRuntimeConfiguration(null, {
        ASSISTANT_AI_PROVIDER: "openai",
        ASSISTANT_AI_MODEL: "gpt-4.1-mini",
      }),
    ).toMatchObject({ provider: "OPENAI" })
    expect(
      resolveAssistantRuntimeConfiguration(null, {
        ASSISTANT_AI_MODEL: "gpt-4.1",
      }),
    ).toBeNull()
  })

  test("dedicated keys take precedence over shared fallbacks", () => {
    expect(
      assistantProviderApiKey("DEEPSEEK", {
        ASSISTANT_DEEPSEEK_API_KEY: "dedicated",
        DEEPSEEK_API: "shared",
      }),
    ).toBe("dedicated")
    expect(
      assistantProviderApiKey("OPENAI", { OPENAI_API_KEY: "shared" }),
    ).toBe("shared")
    expect(assistantProviderApiKey("OPENAI", {})).toBeUndefined()
  })
})
