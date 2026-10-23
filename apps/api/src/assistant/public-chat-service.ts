import { ASSISTANT_RUNTIME_CONFIGURATION_KEY } from "@ewatrade/ai/runtime-config"
import {
  type PublicAssistantInput,
  publicAssistantReply,
} from "@ewatrade/assistant/public/contracts"
import { publicAssistantInstructions } from "@ewatrade/assistant/public/prompt"
import { prisma } from "@ewatrade/db"
import { generateObject } from "ai"
import { z } from "zod"
import { resolveGeneralAssistantModel } from "./model-resolution"

/** Same server-configured provider/model as the merchant assistant, without private tools or scope. */
export async function answerPublicAssistant(
  input: PublicAssistantInput,
  signal: AbortSignal,
) {
  const model = await resolveGeneralAssistantModel({
    dataClassification: "LIVE",
    readRuntimeConfiguration: async () =>
      (
        await prisma.systemConfiguration.findUnique({
          where: { key: ASSISTANT_RUNTIME_CONFIGURATION_KEY },
          select: { value: true },
        })
      )?.value,
  })
  if (!model || model.rehearsal) return null
  const result = await generateObject({
    model: model.model,
    providerOptions: z
      .record(z.string(), z.record(z.string(), z.json()))
      .parse(model.providerOptions),
    system: publicAssistantInstructions,
    messages: input.messages,
    schema: publicAssistantReply,
    maxOutputTokens: 600,
    maxRetries: 0,
    abortSignal: signal,
    experimental_telemetry: {
      isEnabled: false,
      recordInputs: false,
      recordOutputs: false,
    },
  })
  return publicAssistantReply.parse(result.object)
}
