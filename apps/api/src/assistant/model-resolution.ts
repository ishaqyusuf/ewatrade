import {
  type AssistantLanguageModel,
  createAssistantLanguageModel,
} from "@ewatrade/ai/provider"
import { createRehearsalModel } from "@ewatrade/ai/rehearsal-model"
import { resolveAssistantRuntimeConfiguration } from "@ewatrade/ai/runtime-config"
import { respondSetupRehearsal } from "@ewatrade/assistant/setup/rehearsal"
import { evaluateQaProviderPolicy } from "@ewatrade/utils/qa-provider-policy"

export type ResolvedAssistantModel = AssistantLanguageModel & {
  rehearsal: boolean
}

type Environment = Readonly<Record<string, string | undefined>>

/**
 * QA data never reaches a live provider; the rehearsal model is its registered
 * test adapter. Live businesses use the stored runtime configuration.
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
  if (input.dataClassification === "QA" || rehearsalRequested) {
    const decision = evaluateQaProviderPolicy({
      adapter: "test",
      operation: "ai_analysis",
      tenantDataClassification: input.dataClassification,
    })
    if (!decision.allowed) return null
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
  const model = (input.createLiveModel ?? createAssistantLanguageModel)(
    configuration,
    { environment },
  )
  return model ? { ...model, rehearsal: false } : null
}
