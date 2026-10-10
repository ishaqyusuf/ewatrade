import { z } from "zod"

export const VOICE_GATEWAY_KEY = "assistant.voice.gateway.v1"
export const VOICE_POLICY_VERSION = "voice-local-openai-xai-v1"
export const GATEWAY_TTL_MS = 180_000
export const gatewayLeaseSchema = z.object({
  url: z.string().url(),
  generation: z.string().uuid(),
  expiresAt: z.number().int(),
  environment: z.string(),
})
export type VoiceGatewayLease = z.infer<typeof gatewayLeaseSchema>

export function normalizeGatewayUrl(value: string) {
  try {
    const url = new URL(value)
    if (
      url.protocol !== "https:" ||
      url.username ||
      url.password ||
      url.port ||
      url.pathname !== "/" ||
      url.search ||
      url.hash ||
      !/^[a-z0-9-]+\.ngrok-free\.(app|dev)$/.test(url.hostname)
    )
      return null
    return url.origin
  } catch {
    return null
  }
}

export class TranscriptionError extends Error {
  constructor(
    readonly code: string,
    readonly terminal = false,
  ) {
    super(code)
    this.name = "TranscriptionError"
  }
}

export type VoiceProvider = "local_whisper" | "openai" | "xai"
export type VoiceAttempt = {
  ordinal: number
  provider: VoiceProvider
  model: string
  outcome: "started" | "success" | "failed" | "skipped"
  errorCode?: string
  durationMs?: number
  providerRequestId?: string
  gatewayGeneration?: string
  billingStatus: "unknown" | "estimated" | "not_billable"
  estimatedCostMicros?: bigint
  pricingVersion?: string
}
