import {
  type DeepSeekLanguageModelOptions,
  createDeepSeek,
} from "@ai-sdk/deepseek"
import {
  type OpenAILanguageModelResponsesOptions,
  createOpenAI,
} from "@ai-sdk/openai"
import type { LanguageModel } from "ai"
import type { AssistantRuntimeConfiguration } from "./runtime-config"

type Environment = Readonly<Record<string, string | undefined>>

/** Dedicated assistant keys win; existing shared provider keys are fallbacks. */
export function assistantProviderApiKey(
  provider: AssistantRuntimeConfiguration["provider"],
  environment: Environment = process.env,
) {
  return provider === "DEEPSEEK"
    ? environment.ASSISTANT_DEEPSEEK_API_KEY?.trim() ||
        environment.DEEPSEEK_API?.trim()
    : environment.ASSISTANT_OPENAI_API_KEY?.trim() ||
        environment.OPENAI_API_KEY?.trim() ||
        environment.OPENAI_API?.trim()
}

export type AssistantLanguageModel = {
  model: LanguageModel
  provider: string
  modelId: string
  providerOptions: Record<string, Record<string, unknown>>
}

/** Client input never selects a provider, model, credential or endpoint. */
export function createAssistantLanguageModel(
  configuration: AssistantRuntimeConfiguration,
  options: { environment?: Environment; fetchImpl?: typeof fetch } = {},
): AssistantLanguageModel | null {
  const apiKey = assistantProviderApiKey(
    configuration.provider,
    options.environment,
  )
  if (!apiKey) return null
  if (configuration.provider === "DEEPSEEK")
    return {
      model: createDeepSeek({ apiKey, fetch: options.fetchImpl })(
        configuration.model,
      ),
      provider: "deepseek",
      modelId: configuration.model,
      providerOptions: {
        deepseek: {
          thinking: { type: "disabled" },
        } satisfies DeepSeekLanguageModelOptions,
      },
    }
  return {
    model: createOpenAI({ apiKey, fetch: options.fetchImpl })(
      configuration.model,
    ),
    provider: "openai",
    modelId: configuration.model,
    providerOptions: {
      openai: {
        store: false,
      } satisfies OpenAILanguageModelResponsesOptions,
    },
  }
}
