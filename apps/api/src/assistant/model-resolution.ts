import {
  type AssistantLanguageModel,
  createAssistantLanguageModel,
} from "@ewatrade/ai/provider"
import { createRehearsalModel } from "@ewatrade/ai/rehearsal-model"
import { resolveAssistantRuntimeConfiguration } from "@ewatrade/ai/runtime-config"
import { respondSetupRehearsal } from "@ewatrade/assistant/setup/rehearsal"

export type ResolvedAssistantModel = AssistantLanguageModel & {
  rehearsal: boolean
}

type Environment = Readonly<Record<string, string | undefined>>

/**
 * Assistant text is an owner-approved exception to provider-free QA: QA chats
 * use DeepSeek with the same history, draft tools and budget as live chats.
 * Provider-free rehearsal remains an explicit non-production development mode.
 */
export async function resolveSetupAssistantModel(input: {
  dataClassification: "LIVE" | "QA"
  readRuntimeConfiguration: () => Promise<unknown>
  environment?: Environment
  createLiveModel?: typeof createAssistantLanguageModel
}): Promise<ResolvedAssistantModel | null> {
  const environment = input.environment ?? process.env
  const rehearsalRequested =
    environment.ASSISTANT_REHEARSAL_MODE === "true" &&
    environment.APP_ENV !== "production"
  if (rehearsalRequested) {
    return {
      model: createRehearsalModel((prompt) =>
        respondSetupRehearsal(
          prompt as Parameters<typeof respondSetupRehearsal>[0],
        ),
      ),
      provider: "ewatrade-rehearsal",
      modelId: "rehearsal-v1",
      providerOptions: {},
      rehearsal: true,
    }
  }
  const configuration = resolveAssistantRuntimeConfiguration(
    await input.readRuntimeConfiguration(),
    environment,
  )
  if (!configuration) return null
  // The QA exception covers DeepSeek text only, not other live providers.
  if (
    input.dataClassification === "QA" &&
    configuration.provider !== "DEEPSEEK"
  )
    return null
  const model = (input.createLiveModel ?? createAssistantLanguageModel)(
    configuration,
    { environment },
  )
  return model ? { ...model, rehearsal: false } : null
}
