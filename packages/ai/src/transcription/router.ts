import { createHmac, randomUUID } from "node:crypto"
import { z } from "zod"
import type { AssistantTranscriber } from "../media"
import { assistantProviderApiKey } from "../provider"
import {
  TranscriptionError,
  type VoiceAttempt,
  type VoiceGatewayLease,
  type VoiceProvider,
  normalizeGatewayUrl,
} from "./contracts"

type Environment = Readonly<Record<string, string | undefined>>
const transcriptSchema = z.object({
  text: z.string().max(100_000),
  model: z.string().max(200).optional(),
  language: z.string().nullable().optional(),
  duration: z.number().nonnegative().optional(),
  durationSeconds: z.number().nonnegative().optional(),
})

/** Full provider keys and gateway URLs never leave the server. */
export function createFallbackTranscriber(options: {
  environment?: Environment
  fetchImpl?: typeof fetch
  gateway: () => Promise<VoiceGatewayLease | null>
  contentType: string
  audioSeconds: number
  tenantId: string
  digest: string
  assertActive: () => Promise<void>
  recordAttempt: (attempt: VoiceAttempt) => Promise<void>
  circuitOpen?: (provider: VoiceProvider, model: string) => Promise<boolean>
}): AssistantTranscriber {
  const env = options.environment ?? process.env
  const fetchImpl = options.fetchImpl ?? fetch
  return async ({ audio, abortSignal }) => {
    const deadline = AbortSignal.any([
      AbortSignal.timeout(100_000),
      ...(abortSignal ? [abortSignal] : []),
    ])
    const openaiModel = [
      "gpt-4o-mini-transcribe",
      "gpt-4o-transcribe",
      "gpt-transcribe",
    ].includes(env.ASSISTANT_TRANSCRIBE_MODEL ?? "")
      ? (env.ASSISTANT_TRANSCRIBE_MODEL ?? "gpt-4o-mini-transcribe")
      : "gpt-4o-mini-transcribe"
    const providers = [
      { provider: "local_whisper" as const, model: "unknown-local" },
      { provider: "openai" as const, model: openaiModel },
      { provider: "xai" as const, model: "grok-voice-transcribe-2.0" },
    ]
    for (const [index, target] of providers.entries()) {
      deadline.throwIfAborted()
      await options.assertActive()
      const started = Date.now()
      const attempt: VoiceAttempt = {
        ...target,
        ordinal: index + 1,
        outcome: "started",
        billingStatus: "not_billable",
      }
      let dispatched = false
      let result: z.infer<typeof transcriptSchema> | undefined
      let providerRequestId: string | undefined
      const signal = AbortSignal.any([deadline, AbortSignal.timeout(30_000)])
      // Durable admission happens before any external provider request.
      await options.recordAttempt(attempt)
      try {
        if (await options.circuitOpen?.(target.provider, target.model))
          throw new TranscriptionError("CIRCUIT_OPEN")
        let url: string
        let headers: Record<string, string>
        let body: BodyInit
        if (target.provider === "local_whisper") {
          const allowed = (env.ASSISTANT_LOCAL_TENANT_IDS ?? "")
            .split(",")
            .map((x) => x.trim())
          if (!allowed.includes(options.tenantId))
            throw new TranscriptionError("LOCAL_NOT_ENROLLED")
          const lease = await options.gateway()
          const secret = env.ASSISTANT_VOICE_GATEWAY_SECRET
          if (
            !lease ||
            !secret ||
            secret.length < 32 ||
            lease.expiresAt <= Date.now() ||
            lease.environment !== env.APP_ENV ||
            !normalizeGatewayUrl(lease.url)
          )
            throw new TranscriptionError("LOCAL_UNAVAILABLE")
          attempt.gatewayGeneration = lease.generation
          const signedHeaders = (path: string, digest: string) => {
            const expires = String(Date.now() + 35_000)
            const nonce = randomUUID()
            const signature = createHmac("sha256", secret)
              .update(
                `${path}\n${lease.generation}\n${expires}\n${nonce}\n${digest}`,
              )
              .digest("hex")
            return {
              "x-voice-generation": lease.generation,
              "x-voice-expires": expires,
              "x-voice-nonce": nonce,
              "x-voice-digest": digest,
              "x-voice-signature": signature,
              "ngrok-skip-browser-warning": "1",
            }
          }
          const health = await fetchImpl(
            `${normalizeGatewayUrl(lease.url)}/health`,
            {
              headers: signedHeaders("/health", ""),
              signal: AbortSignal.any([signal, AbortSignal.timeout(750)]),
              redirect: "error",
            },
          )
          const ready = z
            .object({
              ready: z.boolean(),
              model: z.string().max(200),
              busy: z.boolean().optional(),
            })
            .safeParse(await health.json())
          if (
            !health.ok ||
            !ready.success ||
            !ready.data.ready ||
            ready.data.busy
          )
            throw new TranscriptionError("LOCAL_NOT_READY")
          attempt.model = ready.data.model
          url = `${normalizeGatewayUrl(lease.url)}/transcribe`
          headers = {
            ...signedHeaders("/transcribe", options.digest),
            "content-type": options.contentType,
          }
          body = Uint8Array.from(audio)
        } else {
          const key =
            target.provider === "openai"
              ? assistantProviderApiKey("OPENAI", env)
              : env.ASSISTANT_XAI_API_KEY || env.XAI_API_KEY
          if (!key) throw new TranscriptionError("PROVIDER_NOT_CONFIGURED")
          url =
            target.provider === "openai"
              ? "https://api.openai.com/v1/audio/transcriptions"
              : "https://api.x.ai/v1/stt"
          headers = { Authorization: `Bearer ${key}` }
          const form = new FormData()
          form.set("model", target.model)
          const ext =
            options.contentType === "audio/mp4"
              ? "m4a"
              : (options.contentType.split("/")[1] ?? "webm")
          form.set(
            "file",
            new Blob([Uint8Array.from(audio)], { type: options.contentType }),
            `recording.${ext}`,
          )
          body = form
          attempt.billingStatus = "unknown"
        }
        await options.assertActive()
        await options.recordAttempt(attempt)
        dispatched = true
        const response = await fetchImpl(url, {
          method: "POST",
          body,
          headers,
          signal,
          redirect: "error",
        })
        providerRequestId =
          response.headers.get("x-request-id")?.slice(0, 200) ?? undefined
        if (!response.ok) {
          // Never include provider response bodies, URLs or credentials in logs/errors.
          await response.body?.cancel()
          throw new TranscriptionError(
            response.status === 429
              ? "RATE_LIMITED"
              : response.status === 401 || response.status === 403
                ? "PROVIDER_AUTH"
                : response.status >= 500
                  ? "PROVIDER_UNAVAILABLE"
                  : "PROVIDER_REJECTED",
          )
        }
        result = transcriptSchema.parse(await response.json())
        if (!result.text.trim()) throw new TranscriptionError("NO_SPEECH", true)
      } catch (error) {
        attempt.outcome = dispatched ? "failed" : "skipped"
        attempt.errorCode =
          error instanceof TranscriptionError
            ? error.code
            : signal.aborted
              ? "TIMEOUT"
              : "INVALID_RESPONSE"
        attempt.durationMs = Date.now() - started
        attempt.providerRequestId = providerRequestId
        await options.recordAttempt(attempt)
        if (
          deadline.aborted ||
          (error instanceof TranscriptionError && error.terminal)
        )
          throw error
        continue
      }
      await options.assertActive()
      attempt.outcome = "success"
      attempt.providerRequestId = providerRequestId
      attempt.durationMs = Date.now() - started
      if (result.model) attempt.model = result.model
      const rate = Number(
        env[
          target.provider === "openai"
            ? "ASSISTANT_OPENAI_STT_MICROS_PER_MINUTE"
            : "ASSISTANT_XAI_STT_MICROS_PER_MINUTE"
        ],
      )
      if (target.provider === "local_whisper") {
        attempt.billingStatus = "not_billable"
        attempt.estimatedCostMicros = 0n
      } else if (
        Number.isSafeInteger(rate) &&
        rate > 0 &&
        env.ASSISTANT_VOICE_PRICING_VERSION
      ) {
        attempt.billingStatus = "estimated"
        attempt.estimatedCostMicros = BigInt(
          Math.ceil((options.audioSeconds * rate) / 60),
        )
        attempt.pricingVersion = env.ASSISTANT_VOICE_PRICING_VERSION
      }
      await options.recordAttempt(attempt)
      return {
        provider: target.provider,
        model: attempt.model,
        text: result.text.trim(),
        language: result.language ?? null,
        durationSeconds:
          result.durationSeconds ?? result.duration ?? options.audioSeconds,
      }
    }
    throw new TranscriptionError("ALL_PROVIDERS_FAILED", true)
  }
}
