import { z } from "zod"

export const ASSISTANT_RUNTIME_CONFIGURATION_KEY = "assistant.runtime"

export const ASSISTANT_TEXT_MODELS = {
  DEEPSEEK: ["deepseek-flash", "deepseek-v4-pro"],
  OPENAI: ["gpt-4.1-mini", "gpt-4.1"],
} as const

export type AssistantProvider = keyof typeof ASSISTANT_TEXT_MODELS

export const DEFAULT_ASSISTANT_RUNTIME = {
  provider: "DEEPSEEK",
  model: "deepseek-flash",
} as const satisfies { provider: AssistantProvider; model: string }

const runtimeSchema = z
  .object({
    enabled: z.boolean(),
    provider: z.enum(["DEEPSEEK", "OPENAI"]),
    model: z.string().min(1).max(80),
  })
  .strict()
  .refine((value) =>
    (ASSISTANT_TEXT_MODELS[value.provider] as readonly string[]).includes(
      value.model,
    ),
  )

export type AssistantRuntimeConfiguration = z.infer<typeof runtimeSchema>

/**
 * Persisted configuration wins, then environment, then the documented default.
 * An invalid persisted value fails closed instead of silently falling back.
 */
export function resolveAssistantRuntimeConfiguration(
  stored: unknown,
  environment: Readonly<Record<string, string | undefined>> = process.env,
): AssistantRuntimeConfiguration | null {
  if (stored !== undefined && stored !== null) {
    const parsed = runtimeSchema.safeParse(stored)
    return parsed.success && parsed.data.enabled ? parsed.data : null
  }
  const provider = environment.ASSISTANT_AI_PROVIDER?.trim().toUpperCase()
  const model = environment.ASSISTANT_AI_MODEL?.trim()
  if (!provider && !model)
    return { enabled: true, ...DEFAULT_ASSISTANT_RUNTIME }
  const parsed = runtimeSchema.safeParse({
    enabled: true,
    provider: provider ?? DEFAULT_ASSISTANT_RUNTIME.provider,
    model: model ?? DEFAULT_ASSISTANT_RUNTIME.model,
  })
  return parsed.success ? parsed.data : null
}
