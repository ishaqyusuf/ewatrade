import { createOpenAI } from "@ai-sdk/openai"
import { Output, experimental_transcribe, generateText } from "ai"
import type { z } from "zod"
import { assistantProviderApiKey } from "./provider"

type Environment = Readonly<Record<string, string | undefined>>

export const ASSISTANT_MEDIA_MODELS = {
  transcribe: ["gpt-4o-mini-transcribe", "gpt-4o-transcribe"],
  vision: ["gpt-4.1-mini", "gpt-4.1"],
} as const

function pick<T extends readonly string[]>(
  allowed: T,
  requested: string | undefined,
): T[number] {
  const value = requested?.trim()
  return value && (allowed as readonly string[]).includes(value)
    ? (value as T[number])
    : (allowed[0] as T[number])
}

export type AssistantMediaCall = {
  provider: string
  model: string
  inputTokens?: number
  outputTokens?: number
  totalTokens?: number
}

export type AssistantTranscript = AssistantMediaCall & {
  text: string
  language: string | null
  durationSeconds: number | null
}

export type AssistantTranscriber = (input: {
  audio: Uint8Array
  abortSignal?: AbortSignal
}) => Promise<AssistantTranscript>

export type AssistantImageReader = <Schema extends z.ZodType>(input: {
  schema: Schema
  instructions: string
  image: Uint8Array
  mediaType: "image/webp" | "image/jpeg" | "image/png"
  abortSignal?: AbortSignal
}) => Promise<AssistantMediaCall & { output: z.infer<Schema> }>

/** Media is OpenAI-only (D3); null when no assistant OpenAI key is configured. */
export function createOpenAIMediaAdapters(
  options: { environment?: Environment; fetchImpl?: typeof fetch } = {},
): {
  transcribe: AssistantTranscriber
  readImage: AssistantImageReader
} | null {
  const environment = options.environment ?? process.env
  const apiKey = assistantProviderApiKey("OPENAI", environment)
  if (!apiKey) return null
  const openai = createOpenAI({ apiKey, fetch: options.fetchImpl })
  const transcribeModel = pick(
    ASSISTANT_MEDIA_MODELS.transcribe,
    environment.ASSISTANT_TRANSCRIBE_MODEL,
  )
  const visionModel = pick(
    ASSISTANT_MEDIA_MODELS.vision,
    environment.ASSISTANT_VISION_MODEL,
  )
  return {
    transcribe: async ({ audio, abortSignal }) => {
      const result = await experimental_transcribe({
        model: openai.transcription(transcribeModel),
        audio,
        abortSignal,
        maxRetries: 1,
      })
      return {
        provider: "openai",
        model: transcribeModel,
        text: result.text.trim(),
        language: result.language ?? null,
        durationSeconds: result.durationInSeconds ?? null,
      }
    },
    readImage: async ({
      schema,
      instructions,
      image,
      mediaType,
      abortSignal,
    }) => {
      const result = await generateText({
        model: openai(visionModel),
        output: Output.object({ schema }),
        system: instructions,
        messages: [
          {
            role: "user",
            content: [
              {
                type: "text",
                text: "Read this photo for the business setup list.",
              },
              { type: "image", image, mediaType },
            ],
          },
        ],
        maxOutputTokens: 3_000,
        maxRetries: 1,
        abortSignal,
        providerOptions: { openai: { store: false } },
      })
      return {
        provider: "openai",
        model: visionModel,
        output: result.output as z.infer<typeof schema>,
        inputTokens: result.usage.inputTokens,
        outputTokens: result.usage.outputTokens,
        totalTokens: result.usage.totalTokens,
      }
    },
  }
}

/**
 * Provider-free stand-ins for QA tenants and tests. They never read the bytes:
 * outputs are fixed, labelled samples so QA can exercise the whole flow.
 */
export function createRehearsalMediaAdapters(samples: {
  transcript: string
  image: (schema: z.ZodType) => unknown
}): { transcribe: AssistantTranscriber; readImage: AssistantImageReader } {
  return {
    transcribe: async () => ({
      provider: "ewatrade-rehearsal",
      model: "rehearsal-transcribe-v1",
      text: samples.transcript,
      language: null,
      durationSeconds: null,
    }),
    readImage: async ({ schema }) => ({
      provider: "ewatrade-rehearsal",
      model: "rehearsal-vision-v1",
      output: schema.parse(samples.image(schema)),
    }),
  }
}
